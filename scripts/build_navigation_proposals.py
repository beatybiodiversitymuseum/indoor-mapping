#!/usr/bin/env python3
"""Build approval-gated navigation proposals without editing canonical data."""

from __future__ import annotations

import argparse
import copy
import heapq
import json
import math
import uuid
from collections import defaultdict, deque
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import polygonize, transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
GEOJSON = ROOT / "geojson"
OUTPUT = ROOT / "reports" / "navigation-proposals"
FORWARD = Transformer.from_crs("EPSG:4326", "EPSG:26910", always_xy=True).transform
REVERSE = Transformer.from_crs("EPSG:26910", "EPSG:4326", always_xy=True).transform

RAY_LENGTH_METERS = 8.0
MAX_MOVEMENT_METERS = 1.5
BOUNDARY_TOLERANCE_METERS = 0.01
DIAGONAL_FIXTURE_CLEARANCE_METERS = 0.35
MINIMUM_DIAGONAL_SAVING_METERS = 1.0
ACCESS_NODE_DEDUPLICATION_METERS = 0.5
CONNECTOR_FIXTURE_CLEARANCE_METERS = 0.1
CONNECTOR_RAY_LENGTH_METERS = 30.0
CONNECTOR_ENDPOINT_DEDUPLICATION_METERS = 0.1
CONNECTOR_EXISTING_PATH_MAX_HAUSDORFF_METERS = 1.0
CONNECTOR_OVERLAP_BUFFER_METERS = 0.25
CONNECTOR_MAX_EXISTING_PATH_OVERLAP_RATIO = 0.5
COORDINATE_PRECISION = 10


def load(name: str) -> dict:
    return json.loads((GEOJSON / name).read_text(encoding="utf-8"))


def english(properties: dict, key: str) -> str | None:
    value = properties.get(key)
    return value.get("en") if isinstance(value, dict) else value


def coordinate_key(coordinate: tuple[float, float] | list[float]) -> tuple[float, float]:
    return tuple(round(value, COORDINATE_PRECISION) for value in coordinate)


def geometry_points(geometry) -> list[Point]:
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Point":
        return [geometry]
    if geometry.geom_type == "LineString":
        return [Point(geometry.coords[0]), Point(geometry.coords[-1])]
    points = []
    for part in geometry.geoms:
        points.extend(geometry_points(part))
    return points


def nearest_fixture_hit(origin: Point, endpoint: tuple[float, float], fixtures: list, tree: STRtree):
    ray = LineString([origin.coords[0], endpoint])
    best = None
    for index in tree.query(ray):
        fixture = fixtures[int(index)]
        for candidate in geometry_points(ray.intersection(fixture.boundary)):
            distance = origin.distance(candidate)
            if distance <= BOUNDARY_TOLERANCE_METERS:
                continue
            if best is None or distance < best[0]:
                best = (distance, int(index), candidate)
    return best


def path_endpoints(path: dict, waypoint_coordinates: dict) -> tuple[str, str]:
    coordinates = path["geometry"]["coordinates"]
    result = []
    for coordinate in (coordinates[0], coordinates[-1]):
        point = Point(FORWARD(*coordinate))
        result.append(min(waypoint_coordinates, key=lambda node_id: point.distance(waypoint_coordinates[node_id])))
    return result[0], result[1]


def graph_is_connected(edges: list[tuple[str, str]]) -> bool:
    adjacency = defaultdict(set)
    for source, target in edges:
        adjacency[source].add(target)
        adjacency[target].add(source)
    if not adjacency:
        return False
    visited = set()
    queue = deque([next(iter(adjacency))])
    while queue:
        node = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        queue.extend(adjacency[node] - visited)
    return visited == set(adjacency)


def shortest_distance(adjacency: dict, source: str, target: str) -> float:
    distances = {source: 0.0}
    queue = [(0.0, source)]
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances.get(node):
            continue
        if node == target:
            return distance
        for neighbor, weight in adjacency[node].items():
            candidate = distance + weight
            if candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                heapq.heappush(queue, (candidate, neighbor))
    return math.inf


def add_graph_edge(adjacency: dict, source: str, target: str, weight: float) -> None:
    adjacency[source][target] = min(weight, adjacency[source].get(target, math.inf))
    adjacency[target][source] = min(weight, adjacency[target].get(source, math.inf))


def line_angle(line: LineString) -> float:
    start, end = line.coords[0], line.coords[-1]
    return math.atan2(end[1] - start[1], end[0] - start[0])


def lines_are_parallel(first: LineString, second: LineString, tolerance_degrees: float = 5.0) -> bool:
    delta = abs((line_angle(first) - line_angle(second) + math.pi / 2) % math.pi - math.pi / 2)
    return math.degrees(delta) <= tolerance_degrees


def true_corners(polygon) -> list[tuple[float, float]]:
    coordinates = list(polygon.exterior.coords)[:-1]
    corners = []
    for index, coordinate in enumerate(coordinates):
        previous = coordinates[index - 1]
        following = coordinates[(index + 1) % len(coordinates)]
        incoming = (coordinate[0] - previous[0], coordinate[1] - previous[1])
        outgoing = (following[0] - coordinate[0], following[1] - coordinate[1])
        denominator = math.hypot(*incoming) * math.hypot(*outgoing)
        if not denominator:
            continue
        cross = abs(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) / denominator
        if cross > 1e-6:
            corners.append(coordinate)
    return corners


def build_centered_proposal() -> tuple[dict, dict]:
    navigation = load("navigation.geojson")
    units = load("unit.geojson")["features"]
    fixtures_geojson = load("fixture.geojson")["features"]
    museum_floor = transform(
        FORWARD,
        shape(next(feature for feature in units if english(feature["properties"], "name") == "Museum Floor")["geometry"]),
    )
    fixtures = [transform(FORWARD, shape(feature["geometry"])) for feature in fixtures_geojson]
    fixture_union = unary_union(fixtures)
    fixture_tree = STRtree(fixtures)

    points = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point"]
    paths = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_path"]
    waypoint_coordinates = {
        english(feature["properties"], "alt_name"): Point(FORWARD(*feature["geometry"]["coordinates"])) for feature in points
    }
    path_nodes = {feature["id"]: path_endpoints(feature, waypoint_coordinates) for feature in paths}
    column_one_centers = [
        fixtures[index].centroid
        for index, feature in enumerate(fixtures_geojson)
        if (english(feature["properties"], "alt_name") or "").startswith("col_1_cab_")
    ]
    mean_x = sum(point.x for point in column_one_centers) / len(column_one_centers)
    mean_y = sum(point.y for point in column_one_centers) / len(column_one_centers)
    covariance_xx = sum((point.x - mean_x) ** 2 for point in column_one_centers)
    covariance_yy = sum((point.y - mean_y) ** 2 for point in column_one_centers)
    covariance_xy = sum((point.x - mean_x) * (point.y - mean_y) for point in column_one_centers)
    axis_angle = 0.5 * math.atan2(2 * covariance_xy, covariance_xx - covariance_yy)
    museum_north = (math.cos(axis_angle), math.sin(axis_angle))
    if museum_north[1] < 0:
        museum_north = (-museum_north[0], -museum_north[1])
    museum_east = (museum_north[1], -museum_north[0])

    def local_coordinates(point: Point) -> tuple[float, float]:
        return (
            (point.x - mean_x) * museum_east[0] + (point.y - mean_y) * museum_east[1],
            (point.x - mean_x) * museum_north[0] + (point.y - mean_y) * museum_north[1],
        )

    def projected_point(east: float, north: float) -> Point:
        return Point(
            mean_x + east * museum_east[0] + north * museum_north[0],
            mean_y + east * museum_east[1] + north * museum_north[1],
        )

    path_orientation = {}
    paths_by_node = defaultdict(list)
    for path in paths:
        source_id, target_id = path_nodes[path["id"]]
        source_east, source_north = local_coordinates(waypoint_coordinates[source_id])
        target_east, target_north = local_coordinates(waypoint_coordinates[target_id])
        orientation = "north_south" if abs(target_north - source_north) >= abs(target_east - source_east) else "east_west"
        path_orientation[path["id"]] = orientation
        paths_by_node[source_id].append(path["id"])
        paths_by_node[target_id].append(path["id"])

    path_by_id = {path["id"]: path for path in paths}
    path_line = {}
    line_paths = {}
    for orientation in ("north_south", "east_west"):
        remaining = {path["id"] for path in paths if path_orientation[path["id"]] == orientation}
        line_index = 0
        while remaining:
            line_index += 1
            line_id = f"{orientation}_{line_index:03d}"
            queue = [remaining.pop()]
            members = set()
            while queue:
                path_id = queue.pop()
                members.add(path_id)
                for node_id in path_nodes[path_id]:
                    for neighbor in paths_by_node[node_id]:
                        if neighbor in remaining and path_orientation[neighbor] == orientation:
                            remaining.remove(neighbor)
                            queue.append(neighbor)
            line_paths[line_id] = members
            for path_id in members:
                path_line[path_id] = line_id

    center_targets = defaultdict(list)
    centered_paths = set()

    for path in paths:
        source_id, target_id = path_nodes[path["id"]]
        source = waypoint_coordinates[source_id]
        target = waypoint_coordinates[target_id]
        midpoint = Point((source.x + target.x) / 2, (source.y + target.y) / 2)
        orientation = path_orientation[path["id"]]
        normal = museum_east if orientation == "north_south" else museum_north
        left = nearest_fixture_hit(
            midpoint,
            (midpoint.x + normal[0] * RAY_LENGTH_METERS, midpoint.y + normal[1] * RAY_LENGTH_METERS),
            fixtures,
            fixture_tree,
        )
        right = nearest_fixture_hit(
            midpoint,
            (midpoint.x - normal[0] * RAY_LENGTH_METERS, midpoint.y - normal[1] * RAY_LENGTH_METERS),
            fixtures,
            fixture_tree,
        )
        if not left or not right or left[1] == right[1]:
            continue
        centered = Point((left[2].x + right[2].x) / 2, (left[2].y + right[2].y) / 2)
        target_east, target_north = local_coordinates(centered)
        center_targets[path_line[path["id"]]].append(target_east if orientation == "north_south" else target_north)
        centered_paths.add(path["id"])

    line_original = {}
    line_coordinate = {}
    for line_id, member_ids in line_paths.items():
        orientation = path_orientation[next(iter(member_ids))]
        node_ids = {node_id for path_id in member_ids for node_id in path_nodes[path_id]}
        local_values = [local_coordinates(waypoint_coordinates[node_id]) for node_id in node_ids]
        original = sum(value[0] if orientation == "north_south" else value[1] for value in local_values) / len(local_values)
        line_original[line_id] = original
        line_coordinate[line_id] = sum(center_targets[line_id]) / len(center_targets[line_id]) if center_targets[line_id] else original

    north_south_line = {}
    east_west_line = {}
    for path in paths:
        line_id = path_line[path["id"]]
        destination = north_south_line if path_orientation[path["id"]] == "north_south" else east_west_line
        for node_id in path_nodes[path["id"]]:
            destination[node_id] = line_id

    flagged_nodes = {}

    def solve_points() -> dict[str, Point]:
        result = {}
        for node_id, point in waypoint_coordinates.items():
            original_east, original_north = local_coordinates(point)
            east = line_coordinate[north_south_line[node_id]] if node_id in north_south_line else original_east
            north = line_coordinate[east_west_line[node_id]] if node_id in east_west_line else original_north
            result[node_id] = projected_point(east, north)
        return result

    def reset_incident_lines(node_ids: tuple[str, ...] | list[str], reason: str) -> bool:
        reset = False
        for node_id in node_ids:
            flagged_nodes[node_id] = reason
            for line_id in (north_south_line.get(node_id), east_west_line.get(node_id)):
                if line_id and line_coordinate[line_id] != line_original[line_id]:
                    line_coordinate[line_id] = line_original[line_id]
                    reset = True
        return reset

    proposed_points = solve_points()
    changed = True
    while changed:
        changed = False
        for node_id, point in proposed_points.items():
            movement = point.distance(waypoint_coordinates[node_id])
            if movement > MAX_MOVEMENT_METERS:
                changed |= reset_incident_lines(
                    [node_id],
                    f"movement {movement:.2f} m exceeds {MAX_MOVEMENT_METERS:.2f} m",
                )
        if changed:
            proposed_points = solve_points()
            continue
        for path in paths:
            source_id, target_id = path_nodes[path["id"]]
            line = LineString([proposed_points[source_id], proposed_points[target_id]])
            valid = museum_floor.covers(line) and line.distance(fixture_union) >= BOUNDARY_TOLERANCE_METERS
            if valid:
                continue
            changed |= reset_incident_lines(
                [source_id, target_id],
                "reverted because an incident path crossed a hard boundary",
            )
        if changed:
            proposed_points = solve_points()

    for path in paths:
        source_id, target_id = path_nodes[path["id"]]
        source_east, source_north = local_coordinates(proposed_points[source_id])
        target_east, target_north = local_coordinates(proposed_points[target_id])
        cross_axis_delta = abs(target_east - source_east) if path_orientation[path["id"]] == "north_south" else abs(target_north - source_north)
        if cross_axis_delta > 0.001:
            raise ValueError(f"{english(path['properties'], 'alt_name')} is not aligned to a museum axis")

    proposal = copy.deepcopy(navigation)
    changed_nodes = set()
    for feature in proposal["features"]:
        properties = feature["properties"]
        kind = properties.get("wayfinding_type")
        if kind == "walking_grid_point":
            node_id = english(properties, "alt_name")
            original = waypoint_coordinates[node_id]
            proposed = proposed_points[node_id]
            if proposed.distance(original) <= BOUNDARY_TOLERANCE_METERS:
                continue
            coordinate = list(transform(REVERSE, proposed).coords[0])
            feature["geometry"]["coordinates"] = coordinate
            properties["display_point"]["coordinates"] = coordinate
            properties["review_status"] = "proposed_centered"
            properties["route_confirmed"] = False
            properties["proposal_movement_m"] = round(proposed.distance(original), 3)
            changed_nodes.add(node_id)
        elif kind == "walking_path":
            source_id, target_id = path_nodes[feature["id"]]
            if source_id not in changed_nodes and target_id not in changed_nodes:
                continue
            coordinates = [
                list(transform(REVERSE, proposed_points[source_id]).coords[0]),
                list(transform(REVERSE, proposed_points[target_id]).coords[0]),
            ]
            feature["geometry"]["coordinates"] = coordinates
            properties["start_point"] = coordinates[0]
            properties["end_point"] = coordinates[-1]
            midpoint = LineString(coordinates).interpolate(0.5, normalized=True)
            properties["display_point"]["coordinates"] = list(midpoint.coords[0])
            properties["review_status"] = "proposed_centered"
            properties["route_confirmed"] = False

    proposal["proposal"] = {
        "stage": "01-centered",
        "status": "pending_approval",
        "crs_used_for_derivation": "EPSG:26910",
        "changed_waypoints": len(changed_nodes),
        "eligible_enclosed_paths": len(centered_paths),
        "flagged_waypoints": flagged_nodes,
        "parameters": {
            "museum_north_reference": "long axis of Column 1 cabinet run",
            "museum_north_azimuth_degrees": round(math.degrees(math.atan2(museum_north[0], museum_north[1])) % 360, 4),
            "corridor_ray_length_m": RAY_LENGTH_METERS,
            "maximum_automatic_movement_m": MAX_MOVEMENT_METERS,
            "boundary_tolerance_m": BOUNDARY_TOLERANCE_METERS,
        },
    }

    edges = [path_nodes[path["id"]] for path in paths]
    if not graph_is_connected(edges):
        raise ValueError("Centered proposal disconnected the walking graph")
    ids = [feature["id"] for feature in proposal["features"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Centered proposal contains duplicate feature IDs")
    return proposal, {
        "museum_floor": museum_floor,
        "fixtures": fixtures,
        "paths": paths,
        "path_nodes": path_nodes,
        "original_points": waypoint_coordinates,
        "proposed_points": proposed_points,
        "changed_nodes": changed_nodes,
        "flagged_nodes": flagged_nodes,
    }


def build_diagonal_proposal() -> tuple[dict, dict]:
    navigation = load("navigation.geojson")
    units = load("unit.geojson")["features"]
    fixtures_geojson = load("fixture.geojson")["features"]
    museum_floor = transform(
        FORWARD,
        shape(next(feature for feature in units if english(feature["properties"], "name") == "Museum Floor")["geometry"]),
    )
    fixtures = [transform(FORWARD, shape(feature["geometry"])) for feature in fixtures_geojson]
    fixture_union = unary_union(fixtures)
    safe_space = museum_floor.difference(fixture_union.buffer(DIAGONAL_FIXTURE_CLEARANCE_METERS))

    points = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point"]
    paths = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_path"]
    waypoint_coordinates = {
        english(feature["properties"], "alt_name"): Point(FORWARD(*feature["geometry"]["coordinates"])) for feature in points
    }
    path_nodes = {feature["id"]: path_endpoints(feature, waypoint_coordinates) for feature in paths}
    adjacency = defaultdict(dict)
    walking_lines = []
    for path in paths:
        source_id, target_id = path_nodes[path["id"]]
        line = LineString([waypoint_coordinates[source_id], waypoint_coordinates[target_id]])
        walking_lines.append(line)
        add_graph_edge(adjacency, source_id, target_id, line.length)

    faces = list(polygonize(unary_union(walking_lines)))
    candidates = {}
    for face_index, face in enumerate(faces, start=1):
        corners = true_corners(face)
        corner_nodes = []
        for coordinate in corners:
            point = Point(coordinate)
            node_id = min(waypoint_coordinates, key=lambda candidate: point.distance(waypoint_coordinates[candidate]))
            if point.distance(waypoint_coordinates[node_id]) <= BOUNDARY_TOLERANCE_METERS:
                corner_nodes.append(node_id)
        corner_nodes = list(dict.fromkeys(corner_nodes))
        for first_index, source_id in enumerate(corner_nodes):
            for second_index in range(first_index + 1, len(corner_nodes)):
                target_id = corner_nodes[second_index]
                if second_index == first_index + 1 or (first_index == 0 and second_index == len(corner_nodes) - 1):
                    continue
                pair = tuple(sorted((source_id, target_id)))
                if target_id in adjacency[source_id] or pair in candidates:
                    continue
                line = LineString([waypoint_coordinates[source_id], waypoint_coordinates[target_id]])
                if not face.covers(line) or not safe_space.covers(line):
                    continue
                existing_distance = shortest_distance(adjacency, source_id, target_id)
                saving = existing_distance - line.length
                if saving < MINIMUM_DIAGONAL_SAVING_METERS:
                    continue
                candidates[pair] = {
                    "source": source_id,
                    "target": target_id,
                    "line": line,
                    "face_index": face_index,
                    "initial_saving": saving,
                }

    accepted = []
    remaining = list(candidates.values())
    while remaining:
        scored = []
        for candidate in remaining:
            if any(candidate["line"].crosses(existing["line"]) for existing in accepted):
                continue
            saving = shortest_distance(adjacency, candidate["source"], candidate["target"]) - candidate["line"].length
            if saving >= MINIMUM_DIAGONAL_SAVING_METERS:
                scored.append((saving, candidate))
        if not scored:
            break
        saving, best = max(scored, key=lambda item: (item[0], item[1]["source"], item[1]["target"]))
        best["saving"] = saving
        accepted.append(best)
        add_graph_edge(adjacency, best["source"], best["target"], best["line"].length)
        remaining = [candidate for candidate in remaining if candidate is not best]

    proposal = copy.deepcopy(navigation)
    next_path_index = max(path["properties"].get("path_index", 0) for path in paths) + 1
    template = paths[0]
    accepted.sort(key=lambda item: (item["source"], item["target"]))
    for proposal_index, candidate in enumerate(accepted, start=1):
        path_index = next_path_index + proposal_index - 1
        coordinates = [
            list(transform(REVERSE, waypoint_coordinates[candidate["source"]]).coords[0]),
            list(transform(REVERSE, waypoint_coordinates[candidate["target"]]).coords[0]),
        ]
        properties = copy.deepcopy(template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Diagonal Path {proposal_index}"},
                "alt_name": {"en": f"path_{path_index:03d}"},
                "display_point": {"type": "Point", "coordinates": list(LineString(coordinates).interpolate(0.5, normalized=True).coords[0])},
                "path_index": path_index,
                "start_point": coordinates[0],
                "end_point": coordinates[-1],
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_diagonal",
                "review_status": "pending_approval",
                "route_confirmed": False,
                "proposal_saving_m": round(candidate["saving"], 3),
                "proposal_length_m": round(candidate["line"].length, 3),
                "proposal_face_index": candidate["face_index"],
                "proposal_number": proposal_index,
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-diagonal:{candidate['source']}:{candidate['target']}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": properties,
            }
        )

    proposal["proposal"] = {
        "stage": "02-diagonals",
        "status": "pending_approval",
        "crs_used_for_derivation": "EPSG:26910",
        "closed_faces_evaluated": len(faces),
        "candidate_diagonals": len(candidates),
        "accepted_diagonals": len(accepted),
        "parameters": {
            "minimum_saving_m": MINIMUM_DIAGONAL_SAVING_METERS,
            "fixture_clearance_m": DIAGONAL_FIXTURE_CLEARANCE_METERS,
            "hard_boundaries": ["Museum Floor exterior", "fixture polygons"],
        },
    }
    ids = [feature["id"] for feature in proposal["features"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Diagonal proposal contains duplicate feature IDs")
    return proposal, {
        "museum_floor": museum_floor,
        "fixtures": fixtures,
        "walking_lines": walking_lines,
        "accepted": accepted,
    }


def build_cardinal_proposal() -> tuple[dict, dict]:
    navigation = load("navigation.geojson")
    units = load("unit.geojson")["features"]
    fixtures_geojson = load("fixture.geojson")["features"]
    museum_floor = transform(
        FORWARD,
        shape(next(feature for feature in units if english(feature["properties"], "name") == "Museum Floor")["geometry"]),
    )
    fixtures = [transform(FORWARD, shape(feature["geometry"])) for feature in fixtures_geojson]
    fixture_union = unary_union(fixtures)
    safe_space = museum_floor.difference(fixture_union.buffer(DIAGONAL_FIXTURE_CLEARANCE_METERS))
    axis_parameters = json.loads((OUTPUT / "01-centered.geojson").read_text(encoding="utf-8"))["proposal"]["parameters"]
    azimuth = math.radians(axis_parameters["museum_north_azimuth_degrees"])
    museum_north = (math.sin(azimuth), math.cos(azimuth))
    museum_east = (museum_north[1], -museum_north[0])

    points = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point"]
    paths = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_path"]
    waypoint_coordinates = {
        english(feature["properties"], "alt_name"): Point(FORWARD(*feature["geometry"]["coordinates"])) for feature in points
    }
    path_nodes = {feature["id"]: path_endpoints(feature, waypoint_coordinates) for feature in paths}
    line_records = []
    for path in paths:
        source_id, target_id = path_nodes[path["id"]]
        line_records.append(
            {
                "line": LineString([waypoint_coordinates[source_id], waypoint_coordinates[target_id]]),
                "source": source_id,
                "target": target_id,
            }
        )
    faces = list(polygonize(unary_union([record["line"] for record in line_records])))

    raw_candidates = []
    for face_index, face in enumerate(faces, start=1):
        coordinates = list(face.exterior.coords)
        east_values = [x * museum_east[0] + y * museum_east[1] for x, y in coordinates]
        north_values = [x * museum_north[0] + y * museum_north[1] for x, y in coordinates]
        specifications = [
            ("north_south", museum_east, min(east_values), max(east_values), min(north_values), max(north_values)),
            ("east_west", museum_north, min(north_values), max(north_values), min(east_values), max(east_values)),
        ]
        for orientation, cross_axis, cross_min, cross_max, along_min, along_max in specifications:
            along_axis = museum_north if orientation == "north_south" else museum_east
            for offset_fraction in (0.25, 0.5, 0.75):
                cross = cross_min + (cross_max - cross_min) * offset_fraction
                start = (
                    cross_axis[0] * cross + along_axis[0] * (along_min - 2),
                    cross_axis[1] * cross + along_axis[1] * (along_min - 2),
                )
                end = (
                    cross_axis[0] * cross + along_axis[0] * (along_max + 2),
                    cross_axis[1] * cross + along_axis[1] * (along_max + 2),
                )
                intersection = face.intersection(LineString([start, end]))
                parts = [intersection] if intersection.geom_type == "LineString" else [part for part in getattr(intersection, "geoms", []) if part.geom_type == "LineString"]
                for line in parts:
                    if line.length < 2 or not safe_space.covers(line):
                        continue
                    if any(line.distance(record["line"]) < BOUNDARY_TOLERANCE_METERS and line.hausdorff_distance(record["line"]) < BOUNDARY_TOLERANCE_METERS for record in line_records):
                        continue
                    raw_candidates.append(
                        {
                            "face_index": face_index,
                            "orientation": orientation,
                            "offset_fraction": offset_fraction,
                            "line": line,
                        }
                    )

    # Split the base graph at every candidate endpoint so savings are measured correctly.
    all_split_points = [Point(coordinate) for candidate in raw_candidates for coordinate in (candidate["line"].coords[0], candidate["line"].coords[-1])]
    adjacency = defaultdict(dict)
    coordinate_nodes = {}

    def graph_node(point: Point) -> str:
        for node_id, coordinate in waypoint_coordinates.items():
            if point.distance(coordinate) <= 0.1:
                return node_id
        key = coordinate_key(point.coords[0])
        if key not in coordinate_nodes:
            coordinate_nodes[key] = f"candidate:{key[0]}:{key[1]}"
        return coordinate_nodes[key]

    for record in line_records:
        line = record["line"]
        splits = [Point(line.coords[0]), Point(line.coords[-1])]
        splits.extend(point for point in all_split_points if point.distance(line) <= BOUNDARY_TOLERANCE_METERS)
        unique = {coordinate_key(point.coords[0]): point for point in splits}
        ordered = sorted(unique.values(), key=line.project)
        for index in range(1, len(ordered)):
            source = graph_node(ordered[index - 1])
            target = graph_node(ordered[index])
            add_graph_edge(adjacency, source, target, ordered[index - 1].distance(ordered[index]))

    qualifying = []
    for candidate in raw_candidates:
        source = graph_node(Point(candidate["line"].coords[0]))
        target = graph_node(Point(candidate["line"].coords[-1]))
        saving = shortest_distance(adjacency, source, target) - candidate["line"].length
        if saving >= MINIMUM_DIAGONAL_SAVING_METERS:
            candidate.update({"source_node": source, "target_node": target, "initial_saving": saving})
            qualifying.append(candidate)

    remaining = list(qualifying)
    accepted = []
    while remaining:
        scored = []
        for candidate in remaining:
            if any(candidate["line"].crosses(existing["line"]) for existing in accepted):
                continue
            saving = shortest_distance(adjacency, candidate["source_node"], candidate["target_node"]) - candidate["line"].length
            if saving >= MINIMUM_DIAGONAL_SAVING_METERS:
                scored.append((saving, candidate))
        if not scored:
            break
        saving, best = max(scored, key=lambda item: (item[0], item[1]["face_index"], item[1]["orientation"]))
        best["saving"] = saving
        accepted.append(best)
        add_graph_edge(adjacency, best["source_node"], best["target_node"], best["line"].length)
        remaining = [candidate for candidate in remaining if candidate is not best]

    proposal = copy.deepcopy(navigation)
    next_grid_index = max(point["properties"].get("grid_index", 0) for point in points) + 1
    next_path_index = max(path["properties"].get("path_index", 0) for path in paths) + 1
    point_template = points[0]
    path_template = paths[0]
    new_node_by_key = {}

    def proposal_node(point: Point) -> str:
        nonlocal next_grid_index
        for node_id, coordinate in waypoint_coordinates.items():
            if point.distance(coordinate) <= 0.1:
                return node_id
        for key, record in new_node_by_key.items():
            if point.distance(record["point"]) <= 0.1:
                return record["node_id"]
        node_id = f"wp_{next_grid_index:03d}"
        coordinate = list(transform(REVERSE, point).coords[0])
        properties = copy.deepcopy(point_template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Cardinal Junction {next_grid_index}"},
                "alt_name": {"en": node_id},
                "display_point": {"type": "Point", "coordinates": coordinate},
                "grid_index": next_grid_index,
                "node_type": "cardinal_junction",
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_cardinal_junction",
                "review_status": "pending_approval",
                "route_confirmed": False,
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-cardinal-node:{coordinate_key(point.coords[0])}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "Point", "coordinates": coordinate},
                "properties": properties,
            }
        )
        new_node_by_key[coordinate_key(point.coords[0])] = {"node_id": node_id, "point": point}
        next_grid_index += 1
        return node_id

    accepted.sort(key=lambda candidate: (candidate["face_index"], candidate["orientation"]))
    for proposal_number, candidate in enumerate(accepted, start=1):
        source_point = Point(candidate["line"].coords[0])
        target_point = Point(candidate["line"].coords[-1])
        source_id = proposal_node(source_point)
        target_id = proposal_node(target_point)
        path_index = next_path_index + proposal_number - 1
        coordinates = [list(transform(REVERSE, source_point).coords[0]), list(transform(REVERSE, target_point).coords[0])]
        properties = copy.deepcopy(path_template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Cardinal Path {proposal_number}"},
                "alt_name": {"en": f"path_{path_index:03d}"},
                "display_point": {"type": "Point", "coordinates": list(LineString(coordinates).interpolate(0.5, normalized=True).coords[0])},
                "path_index": path_index,
                "start_point": coordinates[0],
                "end_point": coordinates[-1],
                "source": source_id,
                "target": target_id,
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_cardinal_path",
                "review_status": "pending_approval",
                "route_confirmed": False,
                "proposal_saving_m": round(candidate["saving"], 3),
                "proposal_length_m": round(candidate["line"].length, 3),
                "proposal_orientation": candidate["orientation"],
                "proposal_number": proposal_number,
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-cardinal-path:{source_id}:{target_id}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": properties,
            }
        )

    proposal["proposal"] = {
        "stage": "02b-cardinal-paths",
        "status": "pending_approval",
        "crs_used_for_derivation": "EPSG:26910",
        "raw_candidates": len(raw_candidates),
        "qualifying_candidates": len(qualifying),
        "accepted_paths": len(accepted),
        "new_junction_nodes": len(new_node_by_key),
        "parameters": {
            "museum_axes": ["north_south", "east_west"],
            "offset_fractions_tested": [0.25, 0.5, 0.75],
            "minimum_saving_m": MINIMUM_DIAGONAL_SAVING_METERS,
            "fixture_clearance_m": DIAGONAL_FIXTURE_CLEARANCE_METERS,
            "junction_deduplication_m": 0.1,
        },
    }
    return proposal, {
        "museum_floor": museum_floor,
        "fixtures": fixtures,
        "walking_lines": [record["line"] for record in line_records],
        "accepted": accepted,
        "new_nodes": [record["point"] for record in new_node_by_key.values()],
    }


def build_access_proposal() -> tuple[dict, dict]:
    navigation = load("navigation.geojson")
    units = load("unit.geojson")["features"]
    fixtures_geojson = load("fixture.geojson")["features"]
    museum_floor = transform(
        FORWARD,
        shape(next(feature for feature in units if english(feature["properties"], "name") == "Museum Floor")["geometry"]),
    )
    fixtures = [transform(FORWARD, shape(feature["geometry"])) for feature in fixtures_geojson]
    fixture_union = unary_union(fixtures)
    axis_parameters = json.loads((OUTPUT / "01-centered.geojson").read_text(encoding="utf-8"))["proposal"]["parameters"]
    azimuth = math.radians(axis_parameters["museum_north_azimuth_degrees"])
    museum_north = (math.sin(azimuth), math.cos(azimuth))
    museum_east = (museum_north[1], -museum_north[0])
    paths = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_path"]
    path_lines = {feature["id"]: transform(FORWARD, shape(feature["geometry"])) for feature in paths}
    north_south_paths = {}
    for feature in paths:
        line = path_lines[feature["id"]]
        start, end = line.coords[0], line.coords[-1]
        vector = (end[0] - start[0], end[1] - start[1])
        if abs(vector[0] * museum_north[1] - vector[1] * museum_north[0]) <= BOUNDARY_TOLERANCE_METERS:
            north_south_paths[feature["id"]] = line
    closed_area = unary_union(list(polygonize(unary_union(list(path_lines.values())))))

    source_points = {}
    for feature in navigation["features"]:
        if feature["properties"].get("wayfinding_type") != "connection_line":
            continue
        point = Point(FORWARD(*feature["geometry"]["coordinates"][0]))
        source_points.setdefault(coordinate_key(point.coords[0]), point)

    projections = []
    for source_key, point in source_points.items():
        if not closed_area.buffer(0.05).covers(point):
            continue
        ray = LineString(
            [
                (point.x - museum_east[0] * 30, point.y - museum_east[1] * 30),
                (point.x + museum_east[0] * 30, point.y + museum_east[1] * 30),
            ]
        )
        hits = []
        for path_id, line in north_south_paths.items():
            intersection = ray.intersection(line)
            candidates = [intersection] if intersection.geom_type == "Point" else list(getattr(intersection, "geoms", []))
            for candidate in candidates:
                if candidate.geom_type != "Point":
                    continue
                connector = LineString([point, candidate])
                if connector.length < 0.02:
                    continue
                if connector.difference(fixture_union).length < connector.length - 0.05:
                    continue
                hits.append((connector.length, path_id, candidate))
        if hits:
            distance, path_id, projected = min(hits, key=lambda item: item[0])
            projections.append({"source_key": source_key, "source": point, "path_id": path_id, "point": projected, "distance": distance})

    clusters = []
    projection_cluster = {}
    by_path = defaultdict(list)
    for projection in projections:
        by_path[projection["path_id"]].append(projection)
    for path_id, members in by_path.items():
        line = north_south_paths[path_id]
        remaining = sorted(members, key=lambda item: line.project(item["point"]))
        while remaining:
            seed = remaining.pop(0)
            cluster_members = [seed]
            kept = []
            for member in remaining:
                if seed["point"].distance(member["point"]) <= ACCESS_NODE_DEDUPLICATION_METERS:
                    cluster_members.append(member)
                else:
                    kept.append(member)
            remaining = kept
            position = sum(line.project(member["point"]) for member in cluster_members) / len(cluster_members)
            representative = line.interpolate(position)
            cluster = {"path_id": path_id, "point": representative, "members": cluster_members}
            cluster_index = len(clusters)
            clusters.append(cluster)
            for member in cluster_members:
                projection_cluster[member["source_key"]] = cluster_index

    proposal = copy.deepcopy(navigation)
    point_template = next(feature for feature in proposal["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point")
    next_grid_index = max(
        feature["properties"].get("grid_index", 0)
        for feature in proposal["features"]
        if feature["properties"].get("wayfinding_type") == "walking_grid_point"
    ) + 1
    cluster_node = {}
    for cluster_index, cluster in enumerate(clusters):
        grid_index = next_grid_index + cluster_index
        node_id = f"wp_{grid_index:03d}"
        coordinate = list(transform(REVERSE, cluster["point"]).coords[0])
        properties = copy.deepcopy(point_template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Fixture Access Point {grid_index}"},
                "alt_name": {"en": node_id},
                "display_point": {"type": "Point", "coordinates": coordinate},
                "grid_index": grid_index,
                "node_type": "fixture_access_point",
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_fixture_access_point",
                "review_status": "pending_approval",
                "route_confirmed": False,
                "proposal_backbone_path_id": cluster["path_id"],
                "proposal_source_count": len(cluster["members"]),
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-access:{cluster['path_id']}:{coordinate_key(cluster['point'].coords[0])}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "Point", "coordinates": coordinate},
                "properties": properties,
            }
        )
        cluster_node[cluster_index] = {"node_id": node_id, "coordinate": coordinate}

    retargeted = 0
    for feature in proposal["features"]:
        properties = feature["properties"]
        if properties.get("wayfinding_type") != "connection_line":
            continue
        source_key = coordinate_key(Point(FORWARD(*feature["geometry"]["coordinates"][0])).coords[0])
        cluster_index = projection_cluster.get(source_key)
        if cluster_index is None:
            continue
        target = cluster_node[cluster_index]
        properties["proposal_previous_target"] = properties.get("target")
        properties["target"] = target["node_id"]
        properties["end_point"] = target["coordinate"]
        properties["review_status"] = "pending_approval"
        properties["route_confirmed"] = False
        feature["geometry"]["coordinates"][-1] = target["coordinate"]
        midpoint = LineString(feature["geometry"]["coordinates"]).interpolate(0.5, normalized=True)
        properties["display_point"]["coordinates"] = list(midpoint.coords[0])
        retargeted += 1

    proposal["proposal"] = {
        "stage": "03-access-points",
        "status": "approved_by_user",
        "crs_used_for_derivation": "EPSG:26910",
        "unique_fixture_side_points": len(source_points),
        "projectable_fixture_side_points": len(projections),
        "new_access_nodes": len(clusters),
        "retargeted_connections": retargeted,
        "parameters": {
            "projection_direction": "museum_east_west",
            "target_paths": "approved_north_south_walking_paths",
            "deduplication_m": ACCESS_NODE_DEDUPLICATION_METERS,
        },
    }
    return proposal, {
        "museum_floor": museum_floor,
        "fixtures": fixtures,
        "paths": list(path_lines.values()),
        "projections": projections,
        "clusters": clusters,
    }


def build_connector_proposal() -> tuple[dict, dict]:
    navigation = load("navigation.geojson")
    units = load("unit.geojson")["features"]
    fixtures_geojson = load("fixture.geojson")["features"]
    museum_floor = transform(
        FORWARD,
        shape(next(feature for feature in units if english(feature["properties"], "name") == "Museum Floor")["geometry"]),
    )
    fixtures = [transform(FORWARD, shape(feature["geometry"])) for feature in fixtures_geojson]
    fixture_union = unary_union(fixtures)
    fixture_clearance = fixture_union.buffer(CONNECTOR_FIXTURE_CLEARANCE_METERS)
    axis_parameters = json.loads((OUTPUT / "01-centered.geojson").read_text(encoding="utf-8"))["proposal"]["parameters"]
    azimuth = math.radians(axis_parameters["museum_north_azimuth_degrees"])
    museum_north = (math.sin(azimuth), math.cos(azimuth))
    museum_east = (museum_north[1], -museum_north[0])

    points = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point"]
    paths = [feature for feature in navigation["features"] if feature["properties"].get("wayfinding_type") == "walking_path"]
    waypoint_coordinates = {
        english(feature["properties"], "alt_name"): Point(FORWARD(*feature["geometry"]["coordinates"])) for feature in points
    }
    path_lines = {feature["id"]: transform(FORWARD, shape(feature["geometry"])) for feature in paths}
    path_nodes = {feature["id"]: path_endpoints(feature, waypoint_coordinates) for feature in paths}
    north_south_paths = {}
    for path_id, line in path_lines.items():
        start, end = line.coords[0], line.coords[-1]
        vector = (end[0] - start[0], end[1] - start[1])
        length = math.hypot(*vector)
        if not length:
            continue
        cross = abs(vector[0] * museum_north[1] - vector[1] * museum_north[0]) / length
        if cross <= 0.01:
            north_south_paths[path_id] = line

    existing_lines = list(path_lines.values())
    access_points = [
        {
            "node_id": english(feature["properties"], "alt_name"),
            "point": waypoint_coordinates[english(feature["properties"], "alt_name")],
            "path_id": feature["properties"].get("proposal_backbone_path_id"),
        }
        for feature in points
        if feature["properties"].get("node_type") == "fixture_access_point"
        and english(feature["properties"], "alt_name") in waypoint_coordinates
    ]

    def usable_connector(line: LineString) -> bool:
        if line.length < 0.25:
            return False
        if not museum_floor.buffer(BOUNDARY_TOLERANCE_METERS).covers(line):
            return False
        if line.intersects(fixture_clearance):
            return False
        if min(line.hausdorff_distance(existing) for existing in existing_lines) > CONNECTOR_EXISTING_PATH_MAX_HAUSDORFF_METERS:
            return False
        for existing in existing_lines:
            if not lines_are_parallel(line, existing):
                continue
            overlap_ratio = line.intersection(existing.buffer(CONNECTOR_OVERLAP_BUFFER_METERS)).length / line.length
            if overlap_ratio >= CONNECTOR_MAX_EXISTING_PATH_OVERLAP_RATIO:
                return False
        return not any(
            line.distance(existing) < BOUNDARY_TOLERANCE_METERS
            and line.hausdorff_distance(existing) < BOUNDARY_TOLERANCE_METERS
            for existing in existing_lines
        )

    raw_candidates = []
    for access in access_points:
        point = access["point"]
        ray = LineString(
            [
                (point.x - museum_east[0] * CONNECTOR_RAY_LENGTH_METERS, point.y - museum_east[1] * CONNECTOR_RAY_LENGTH_METERS),
                (point.x + museum_east[0] * CONNECTOR_RAY_LENGTH_METERS, point.y + museum_east[1] * CONNECTOR_RAY_LENGTH_METERS),
            ]
        )
        hits_by_direction = {"east": [], "west": []}
        for path_id, line in north_south_paths.items():
            intersection = ray.intersection(line)
            candidates = [intersection] if intersection.geom_type == "Point" else list(getattr(intersection, "geoms", []))
            for candidate in candidates:
                if candidate.geom_type != "Point" or point.distance(candidate) <= CONNECTOR_ENDPOINT_DEDUPLICATION_METERS:
                    continue
                offset = (candidate.x - point.x) * museum_east[0] + (candidate.y - point.y) * museum_east[1]
                direction = "east" if offset > 0 else "west"
                connector = LineString([point, candidate])
                if usable_connector(connector):
                    hits_by_direction[direction].append(
                        {
                            "line": connector,
                            "source": access["node_id"],
                            "target_path_id": path_id,
                            "target_point": candidate,
                            "direction": direction,
                        }
                    )
        for hits in hits_by_direction.values():
            if hits:
                raw_candidates.append(min(hits, key=lambda item: item["line"].length))

    deduped = {}
    for candidate in raw_candidates:
        endpoints = sorted([coordinate_key(candidate["line"].coords[0]), coordinate_key(candidate["line"].coords[-1])])
        deduped.setdefault(tuple(endpoints), candidate)
    accepted = sorted(deduped.values(), key=lambda candidate: (candidate["line"].coords[0][1], candidate["line"].coords[0][0], candidate["direction"]))

    proposal = copy.deepcopy(navigation)
    point_template = next(feature for feature in proposal["features"] if feature["properties"].get("wayfinding_type") == "walking_grid_point")
    path_template = next(feature for feature in proposal["features"] if feature["properties"].get("wayfinding_type") == "walking_path")
    next_grid_index = max(point["properties"].get("grid_index", 0) for point in points) + 1
    next_path_index = max(path["properties"].get("path_index", 0) for path in paths) + 1
    new_node_by_key = {}

    def connector_node(point: Point) -> str:
        nonlocal next_grid_index
        for node_id, coordinate in waypoint_coordinates.items():
            if point.distance(coordinate) <= CONNECTOR_ENDPOINT_DEDUPLICATION_METERS:
                return node_id
        for record in new_node_by_key.values():
            if point.distance(record["point"]) <= CONNECTOR_ENDPOINT_DEDUPLICATION_METERS:
                return record["node_id"]
        node_id = f"wp_{next_grid_index:03d}"
        coordinate = list(transform(REVERSE, point).coords[0])
        properties = copy.deepcopy(point_template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Connector Junction {next_grid_index}"},
                "alt_name": {"en": node_id},
                "display_point": {"type": "Point", "coordinates": coordinate},
                "grid_index": next_grid_index,
                "node_type": "connector_junction",
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_connector_junction",
                "review_status": "pending_approval",
                "route_confirmed": False,
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-connector-node:{coordinate_key(point.coords[0])}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "Point", "coordinates": coordinate},
                "properties": properties,
            }
        )
        new_node_by_key[coordinate_key(point.coords[0])] = {"node_id": node_id, "point": point}
        next_grid_index += 1
        return node_id

    for proposal_number, candidate in enumerate(accepted, start=1):
        source_point = Point(candidate["line"].coords[0])
        target_point = Point(candidate["line"].coords[-1])
        source_id = connector_node(source_point)
        target_id = connector_node(target_point)
        path_index = next_path_index + proposal_number - 1
        coordinates = [list(transform(REVERSE, source_point).coords[0]), list(transform(REVERSE, target_point).coords[0])]
        properties = copy.deepcopy(path_template["properties"])
        properties.update(
            {
                "name": {"en": f"Proposed Connector Path {proposal_number}"},
                "alt_name": {"en": f"path_{path_index:03d}"},
                "display_point": {"type": "Point", "coordinates": list(LineString(coordinates).interpolate(0.5, normalized=True).coords[0])},
                "path_index": path_index,
                "start_point": coordinates[0],
                "end_point": coordinates[-1],
                "source": source_id,
                "target": target_id,
                "source_layer": "navigation_proposal",
                "source_wayfinding_type": "proposed_connector_path",
                "review_status": "pending_approval",
                "route_confirmed": False,
                "proposal_length_m": round(candidate["line"].length, 3),
                "proposal_direction": candidate["direction"],
                "proposal_number": proposal_number,
            }
        )
        proposal["features"].append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"beaty-navigation-connector-path:{source_id}:{target_id}")),
                "type": "Feature",
                "feature_type": "navigation",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": properties,
            }
        )

    proposal["proposal"] = {
        "stage": "04-cardinal-connectors",
        "status": "pending_approval",
        "crs_used_for_derivation": "EPSG:26910",
        "raw_candidates": len(raw_candidates),
        "accepted_connectors": len(accepted),
        "new_junction_nodes": len(new_node_by_key),
        "parameters": {
            "projection_direction": "museum_east_west",
            "source_nodes": "fixture_access_point",
            "target_paths": "north_south_walking_paths",
            "fixture_clearance_m": CONNECTOR_FIXTURE_CLEARANCE_METERS,
            "ray_length_m": CONNECTOR_RAY_LENGTH_METERS,
            "endpoint_deduplication_m": CONNECTOR_ENDPOINT_DEDUPLICATION_METERS,
            "maximum_existing_path_hausdorff_m": CONNECTOR_EXISTING_PATH_MAX_HAUSDORFF_METERS,
            "maximum_parallel_existing_path_overlap_ratio": CONNECTOR_MAX_EXISTING_PATH_OVERLAP_RATIO,
            "overlap_buffer_m": CONNECTOR_OVERLAP_BUFFER_METERS,
        },
    }
    return proposal, {
        "museum_floor": museum_floor,
        "fixtures": fixtures,
        "walking_lines": existing_lines,
        "connectors": accepted,
        "rejected_count": len(raw_candidates) - len(accepted),
    }


def plot_centered(context: dict, output_path: Path) -> None:
    figure, axis = plt.subplots(figsize=(16, 9), dpi=180)
    floor_x, floor_y = context["museum_floor"].exterior.xy
    axis.fill(floor_x, floor_y, color="#eef3ed", ec="#25352f", lw=1.2, zorder=0)
    for fixture in context["fixtures"]:
        x, y = fixture.exterior.xy
        axis.fill(x, y, color="#9d8171", ec="#5c463b", lw=0.2, zorder=1)
    for path in context["paths"]:
        source_id, target_id = context["path_nodes"][path["id"]]
        original = [context["original_points"][source_id], context["original_points"][target_id]]
        proposed = [context["proposed_points"][source_id], context["proposed_points"][target_id]]
        axis.plot([point.x for point in original], [point.y for point in original], color="#77828c", lw=0.8, ls="--", zorder=2)
        axis.plot([point.x for point in proposed], [point.y for point in proposed], color="#0878a4", lw=1.4, zorder=3)
    for node_id in context["changed_nodes"]:
        original = context["original_points"][node_id]
        proposed = context["proposed_points"][node_id]
        axis.plot([original.x, proposed.x], [original.y, proposed.y], color="#d18b22", lw=0.7, zorder=4)
        axis.scatter(proposed.x, proposed.y, s=5, color="#0878a4", zorder=5)
    for node_id in context["flagged_nodes"]:
        point = context["original_points"][node_id]
        axis.scatter(point.x, point.y, s=22, facecolor="none", edgecolor="#c74444", lw=1.2, zorder=6)
    axis.legend(
        handles=[
            Line2D([0], [0], color="#77828c", ls="--", lw=1, label="Current walking grid"),
            Line2D([0], [0], color="#0878a4", lw=2, label="Proposed centered grid"),
            Line2D([0], [0], color="#d18b22", lw=1, label="Waypoint movement"),
            Line2D([0], [0], marker="o", markerfacecolor="none", markeredgecolor="#c74444", lw=0, label="Flagged centered line reset"),
        ],
        loc="upper left",
        frameon=True,
    )
    axis.set_title(
        f"Navigation Stage 1: Corridor Centering — {len(context['changed_nodes'])} moved, {len(context['flagged_nodes'])} flagged\n"
        "Museum north-south follows the long axis of the Column 1 cabinet run",
        fontsize=13,
    )
    axis.set_aspect("equal")
    axis.set_axis_off()
    figure.tight_layout(pad=0.4)
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


def plot_diagonals(context: dict, output_path: Path) -> None:
    figure, axis = plt.subplots(figsize=(16, 9), dpi=180)
    floor_x, floor_y = context["museum_floor"].exterior.xy
    axis.fill(floor_x, floor_y, color="#eef3ed", ec="#25352f", lw=1.2, zorder=0)
    for fixture in context["fixtures"]:
        x, y = fixture.exterior.xy
        axis.fill(x, y, color="#9d8171", ec="#5c463b", lw=0.2, zorder=1)
    for line in context["walking_lines"]:
        x, y = line.xy
        axis.plot(x, y, color="#0878a4", lw=1.1, zorder=2)
    for number, candidate in enumerate(context["accepted"], start=1):
        x, y = candidate["line"].xy
        axis.plot(x, y, color="#c43f8d", lw=2.2, zorder=4)
        midpoint = candidate["line"].interpolate(0.5, normalized=True)
        axis.text(
            midpoint.x,
            midpoint.y,
            str(number),
            ha="center",
            va="center",
            fontsize=7,
            color="#fff",
            bbox={"boxstyle": "circle,pad=0.22", "facecolor": "#982766", "edgecolor": "#fff", "linewidth": 0.6},
            zorder=5,
        )
    axis.legend(
        handles=[
            Line2D([0], [0], color="#0878a4", lw=2, label="Approved centered grid"),
            Line2D([0], [0], color="#c43f8d", lw=2.5, label="Proposed distance-saving diagonal"),
        ],
        loc="upper left",
        frameon=True,
    )
    axis.set_title(
        f"{context.get('title', 'Navigation Stage 2: Useful Diagonals')} — {len(context['accepted'])} proposed\n"
        f"Each saves at least {MINIMUM_DIAGONAL_SAVING_METERS:.0f} m and keeps {DIAGONAL_FIXTURE_CLEARANCE_METERS:.2f} m fixture clearance",
        fontsize=13,
    )
    axis.set_aspect("equal")
    axis.set_axis_off()
    figure.tight_layout(pad=0.4)
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


def plot_cardinal_paths(context: dict, output_path: Path) -> None:
    figure, axis = plt.subplots(figsize=(16, 9), dpi=180)
    floor_x, floor_y = context["museum_floor"].exterior.xy
    axis.fill(floor_x, floor_y, color="#eef3ed", ec="#25352f", lw=1.2, zorder=0)
    for fixture in context["fixtures"]:
        x, y = fixture.exterior.xy
        axis.fill(x, y, color="#9d8171", ec="#5c463b", lw=0.2, zorder=1)
    for line in context["walking_lines"]:
        x, y = line.xy
        axis.plot(x, y, color="#0878a4", lw=1.0, zorder=2)
    for number, candidate in enumerate(context["accepted"], start=1):
        x, y = candidate["line"].xy
        axis.plot(x, y, color="#26966f", lw=2.1, zorder=4)
        midpoint = candidate["line"].interpolate(0.5, normalized=True)
        axis.text(
            midpoint.x,
            midpoint.y,
            str(number),
            ha="center",
            va="center",
            fontsize=6.5,
            color="#fff",
            bbox={"boxstyle": "circle,pad=0.2", "facecolor": "#176d65", "edgecolor": "#fff", "linewidth": 0.5},
            zorder=6,
        )
    for point in context["new_nodes"]:
        axis.scatter(point.x, point.y, s=12, color="#f1b52b", edgecolor="#fff", lw=0.5, zorder=5)
    axis.legend(
        handles=[
            Line2D([0], [0], color="#0878a4", lw=2, label="Approved navigation paths"),
            Line2D([0], [0], color="#26966f", lw=2.5, label="Proposed museum-cardinal path"),
            Line2D([0], [0], marker="o", markerfacecolor="#f1b52b", markeredgecolor="#fff", lw=0, label="Proposed junction node"),
        ],
        loc="upper left",
        frameon=True,
    )
    axis.set_title(
        f"Navigation Stage 2B: Museum-Cardinal Cross-Links — {len(context['accepted'])} proposed\n"
        f"Each saves at least {MINIMUM_DIAGONAL_SAVING_METERS:.0f} m and keeps {DIAGONAL_FIXTURE_CLEARANCE_METERS:.2f} m fixture clearance",
        fontsize=13,
    )
    axis.set_aspect("equal")
    axis.set_axis_off()
    figure.tight_layout(pad=0.4)
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


def plot_access_points(context: dict, output_path: Path) -> None:
    figure, axis = plt.subplots(figsize=(16, 9), dpi=180)
    floor_x, floor_y = context["museum_floor"].exterior.xy
    axis.fill(floor_x, floor_y, color="#eef3ed", ec="#25352f", lw=1.2, zorder=0)
    for fixture in context["fixtures"]:
        x, y = fixture.exterior.xy
        axis.fill(x, y, color="#9d8171", ec="#5c463b", lw=0.2, zorder=1)
    for line in context["paths"]:
        x, y = line.xy
        axis.plot(x, y, color="#0878a4", lw=0.9, zorder=2)
    for projection in context["projections"]:
        axis.plot(
            [projection["source"].x, projection["point"].x],
            [projection["source"].y, projection["point"].y],
            color="#70b99c",
            lw=0.25,
            alpha=0.18,
            zorder=3,
        )
    points = [cluster["point"] for cluster in context["clusters"]]
    axis.scatter([point.x for point in points], [point.y for point in points], s=8, color="#f1b52b", edgecolor="#8b6410", lw=0.2, zorder=4)
    axis.legend(
        handles=[
            Line2D([0], [0], color="#0878a4", lw=2, label="Approved navigation path"),
            Line2D([0], [0], color="#70b99c", lw=1, label="Fixture point east-west projection"),
            Line2D([0], [0], marker="o", markerfacecolor="#f1b52b", markeredgecolor="#8b6410", lw=0, label="Fixture access node (0.5 m dedupe)"),
        ],
        loc="upper left",
        frameon=True,
    )
    axis.set_title(
        f"Approved Fixture Access Points — {len(context['projections'])} projectable points, {len(points)} routing nodes",
        fontsize=13,
    )
    axis.set_aspect("equal")
    axis.set_axis_off()
    figure.tight_layout(pad=0.4)
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


def plot_connectors(context: dict, output_path: Path) -> None:
    figure, axis = plt.subplots(figsize=(16, 9), dpi=180)
    floor_x, floor_y = context["museum_floor"].exterior.xy
    axis.fill(floor_x, floor_y, color="#eef3ed", ec="#25352f", lw=1.2, zorder=0)
    for fixture in context["fixtures"]:
        x, y = fixture.exterior.xy
        axis.fill(x, y, color="#9d8171", ec="#5c463b", lw=0.2, zorder=1)
    for line in context["walking_lines"]:
        x, y = line.xy
        axis.plot(x, y, color="#0878a4", lw=0.7, alpha=0.55, zorder=2)
    for index, candidate in enumerate(context["connectors"], start=1):
        line = candidate["line"]
        x, y = line.xy
        axis.plot(x, y, color="#26966f", lw=1.8, zorder=3)
        midpoint = line.interpolate(0.5, normalized=True)
        axis.text(
            midpoint.x,
            midpoint.y,
            str(index),
            color="#16392d",
            fontsize=5,
            ha="center",
            va="center",
            bbox={"boxstyle": "round,pad=0.12", "fc": "#f7fff9", "ec": "#26966f", "lw": 0.4},
            zorder=4,
        )
    axis.legend(
        handles=[
            Line2D([0], [0], color="#0878a4", lw=2, label="Approved navigation path"),
            Line2D([0], [0], color="#26966f", lw=2.5, label="Proposed fixture-access connector"),
        ],
        loc="upper left",
        frameon=True,
    )
    axis.set_title(
        f"Navigation Stage 4: Fixture Access Connectors — {len(context['connectors'])} candidates, {CONNECTOR_FIXTURE_CLEARANCE_METERS:.2f} m fixture clearance",
        fontsize=13,
    )
    axis.set_aspect("equal")
    axis.set_axis_off()
    figure.tight_layout(pad=0.4)
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stage",
        choices=[
            "centered",
            "apply-centered",
            "diagonals",
            "apply-diagonals",
            "cardinal",
            "apply-cardinal",
            "access",
            "apply-access",
            "connectors",
            "apply-connectors",
            "rerun-diagonals",
        ],
        help="Proposal stage to generate or apply",
    )
    parser.add_argument("--approve", help="Comma-separated proposal numbers to apply selectively")
    parser.add_argument("--no-plot", action="store_true", help="Write proposal GeoJSON without rendering a PNG preview")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if args.stage == "centered":
        proposal, context = build_centered_proposal()
        geojson_path = OUTPUT / "01-centered.geojson"
        image_path = OUTPUT / "01-centered.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        plot_centered(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        print(f"Wrote {image_path.relative_to(ROOT)}")
    elif args.stage == "apply-centered":
        proposal_path = OUTPUT / "01-centered.geojson"
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
        if proposal.get("proposal", {}).get("status") != "pending_approval":
            raise ValueError("Stage 1 proposal is missing or is not pending approval")
        proposal.pop("proposal", None)
        waypoint_coordinates = {
            english(feature["properties"], "alt_name"): feature["geometry"]["coordinates"]
            for feature in proposal["features"]
            if feature["properties"].get("wayfinding_type") == "walking_grid_point"
        }
        for feature in proposal["features"]:
            properties = feature["properties"]
            if properties.get("review_status") == "proposed_centered":
                properties["review_status"] = "locally_confirmed"
                properties["route_confirmed"] = True
                properties.pop("proposal_movement_m", None)
            if properties.get("wayfinding_type") == "connection_line":
                target = waypoint_coordinates.get(properties.get("target"))
                if not target:
                    raise ValueError(f"Connection target does not resolve: {properties.get('target')}")
                feature["geometry"]["coordinates"][-1] = target
                properties["end_point"] = target
                midpoint = LineString(feature["geometry"]["coordinates"]).interpolate(0.5, normalized=True)
                properties["display_point"]["coordinates"] = list(midpoint.coords[0])
        destination = GEOJSON / "navigation.geojson"
        destination.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        print(f"Applied approved Stage 1 proposal to {destination.relative_to(ROOT)}")
    elif args.stage == "diagonals":
        proposal, context = build_diagonal_proposal()
        geojson_path = OUTPUT / "02-diagonals.geojson"
        image_path = OUTPUT / "02-diagonals.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        plot_diagonals(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        print(f"Wrote {image_path.relative_to(ROOT)}")
    elif args.stage == "apply-diagonals":
        proposal_path = OUTPUT / "02-diagonals.geojson"
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
        if proposal.get("proposal", {}).get("status") != "pending_approval":
            raise ValueError("Stage 2 diagonal proposal is missing or is not pending approval")
        proposal.pop("proposal", None)
        for feature in proposal["features"]:
            properties = feature["properties"]
            if properties.get("source_wayfinding_type") != "proposed_diagonal":
                continue
            properties["source_layer"] = "navigation"
            properties["source_wayfinding_type"] = "approved_diagonal"
            properties["review_status"] = "locally_confirmed"
            properties["route_confirmed"] = True
            for key in ("proposal_saving_m", "proposal_length_m", "proposal_face_index", "proposal_number"):
                properties.pop(key, None)
        destination = GEOJSON / "navigation.geojson"
        destination.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        print(f"Applied approved Stage 2 diagonals to {destination.relative_to(ROOT)}")
    elif args.stage == "cardinal":
        proposal, context = build_cardinal_proposal()
        geojson_path = OUTPUT / "02b-cardinal-paths.geojson"
        image_path = OUTPUT / "02b-cardinal-paths.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        plot_cardinal_paths(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        print(f"Wrote {image_path.relative_to(ROOT)}")
    elif args.stage == "apply-cardinal":
        if not args.approve:
            raise ValueError("apply-cardinal requires --approve")
        approved_numbers = sorted({int(value.strip()) for value in args.approve.split(",")})
        proposal_path = OUTPUT / "02b-cardinal-paths.geojson"
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
        if proposal.get("proposal", {}).get("status") != "pending_approval":
            raise ValueError("Stage 2B cardinal proposal is missing or is not pending approval")
        selected_paths = [
            feature for feature in proposal["features"]
            if feature["properties"].get("source_wayfinding_type") == "proposed_cardinal_path"
            and feature["properties"].get("proposal_number") in approved_numbers
        ]
        if len(selected_paths) != len(approved_numbers):
            raise ValueError("One or more approved cardinal proposal numbers do not resolve")
        selected_paths.sort(key=lambda feature: feature["properties"]["proposal_number"])
        selected_node_ids = {
            node_id for feature in selected_paths for node_id in (feature["properties"]["source"], feature["properties"]["target"])
        }
        selected_nodes = [
            feature for feature in proposal["features"]
            if feature["properties"].get("source_wayfinding_type") == "proposed_cardinal_junction"
            and english(feature["properties"], "alt_name") in selected_node_ids
        ]
        selected_nodes.sort(key=lambda feature: feature["properties"]["grid_index"])
        canonical = load("navigation.geojson")
        next_grid_index = max(
            feature["properties"].get("grid_index", 0)
            for feature in canonical["features"]
            if feature["properties"].get("wayfinding_type") == "walking_grid_point"
        ) + 1
        next_path_index = max(
            feature["properties"].get("path_index", 0)
            for feature in canonical["features"]
            if feature["properties"].get("wayfinding_type") == "walking_path"
        ) + 1
        node_id_map = {}
        for offset, feature in enumerate(selected_nodes):
            properties = feature["properties"]
            old_node_id = english(properties, "alt_name")
            new_index = next_grid_index + offset
            new_node_id = f"wp_{new_index:03d}"
            node_id_map[old_node_id] = new_node_id
            properties.update(
                {
                    "name": {"en": f"Cardinal Junction {new_index}"},
                    "alt_name": {"en": new_node_id},
                    "grid_index": new_index,
                    "source_layer": "navigation",
                    "source_wayfinding_type": "approved_cardinal_junction",
                    "review_status": "locally_confirmed",
                    "route_confirmed": True,
                }
            )
        for offset, feature in enumerate(selected_paths):
            properties = feature["properties"]
            new_index = next_path_index + offset
            properties.update(
                {
                    "name": {"en": f"Cardinal Path {new_index}"},
                    "alt_name": {"en": f"path_{new_index:03d}"},
                    "path_index": new_index,
                    "source": node_id_map.get(properties["source"], properties["source"]),
                    "target": node_id_map.get(properties["target"], properties["target"]),
                    "source_layer": "navigation",
                    "source_wayfinding_type": "approved_cardinal_path",
                    "review_status": "locally_confirmed",
                    "route_confirmed": True,
                }
            )
            for key in ("proposal_saving_m", "proposal_length_m", "proposal_orientation", "proposal_number"):
                properties.pop(key, None)
        canonical["features"].extend(selected_nodes)
        canonical["features"].extend(selected_paths)
        destination = GEOJSON / "navigation.geojson"
        destination.write_text(json.dumps(canonical, indent=2) + "\n", encoding="utf-8")
        print(f"Applied cardinal proposals {approved_numbers} to {destination.relative_to(ROOT)}")
    elif args.stage == "access":
        proposal, context = build_access_proposal()
        geojson_path = OUTPUT / "03-access-points.geojson"
        image_path = OUTPUT / "03-access-points.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        plot_access_points(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        print(f"Wrote {image_path.relative_to(ROOT)}")
    elif args.stage == "apply-access":
        proposal_path = OUTPUT / "03-access-points.geojson"
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
        if proposal.get("proposal", {}).get("status") != "approved_by_user":
            raise ValueError("Stage 3 access proposal is missing approval")
        proposal.pop("proposal", None)
        for feature in proposal["features"]:
            properties = feature["properties"]
            if properties.get("source_wayfinding_type") == "proposed_fixture_access_point":
                properties["name"] = {"en": properties["name"]["en"].replace("Proposed ", "", 1)}
                properties["source_layer"] = "navigation"
                properties["source_wayfinding_type"] = "fixture_access_point"
                properties["review_status"] = "locally_confirmed"
                properties["route_confirmed"] = True
                properties.pop("proposal_backbone_path_id", None)
                properties.pop("proposal_source_count", None)
            elif properties.get("wayfinding_type") == "connection_line" and "proposal_previous_target" in properties:
                properties["review_status"] = "locally_confirmed"
                properties["route_confirmed"] = True
                properties.pop("proposal_previous_target", None)
        destination = GEOJSON / "navigation.geojson"
        destination.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        print(f"Applied approved fixture access points to {destination.relative_to(ROOT)}")
    elif args.stage == "connectors":
        proposal, context = build_connector_proposal()
        geojson_path = OUTPUT / "04-cardinal-connectors.geojson"
        image_path = OUTPUT / "04-cardinal-connectors.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        if not args.no_plot:
            plot_connectors(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        if not args.no_plot:
            print(f"Wrote {image_path.relative_to(ROOT)}")
    elif args.stage == "apply-connectors":
        proposal_path = OUTPUT / "04-cardinal-connectors.geojson"
        proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
        if proposal.get("proposal", {}).get("status") != "approved_by_user":
            raise ValueError("Stage 4 connector proposal is missing approval")
        proposal.pop("proposal", None)
        for feature in proposal["features"]:
            properties = feature["properties"]
            if properties.get("source_wayfinding_type") == "proposed_connector_junction":
                properties["name"] = {"en": properties["name"]["en"].replace("Proposed ", "", 1)}
                properties["source_layer"] = "navigation"
                properties["source_wayfinding_type"] = "approved_connector_junction"
                properties["review_status"] = "locally_confirmed"
                properties["route_confirmed"] = True
            elif properties.get("source_wayfinding_type") == "proposed_connector_path":
                properties["name"] = {"en": properties["name"]["en"].replace("Proposed ", "", 1)}
                properties["source_layer"] = "navigation"
                properties["source_wayfinding_type"] = "approved_connector_path"
                properties["review_status"] = "locally_confirmed"
                properties["route_confirmed"] = True
                for key in ("proposal_length_m", "proposal_direction", "proposal_number"):
                    properties.pop(key, None)
        destination = GEOJSON / "navigation.geojson"
        destination.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        print(f"Applied approved fixture access connectors to {destination.relative_to(ROOT)}")
    elif args.stage == "rerun-diagonals":
        proposal, context = build_diagonal_proposal()
        proposal["proposal"]["stage"] = "05-diagonals-after-connectors"
        context["title"] = "Navigation Stage 4: Diagonals After Fixture Access"
        geojson_path = OUTPUT / "05-diagonals-after-connectors.geojson"
        image_path = OUTPUT / "05-diagonals-after-connectors.png"
        geojson_path.write_text(json.dumps(proposal, indent=2) + "\n", encoding="utf-8")
        plot_diagonals(context, image_path)
        print(json.dumps(proposal["proposal"], indent=2))
        print(f"Wrote {geojson_path.relative_to(ROOT)}")
        print(f"Wrote {image_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
