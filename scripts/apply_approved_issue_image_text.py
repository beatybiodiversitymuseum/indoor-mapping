#!/usr/bin/env python3
"""Apply reviewed OCR text to the approved issue images in exhibit.geojson.

Run extract_issue_image_text.py first. The transcription report is evidence;
only the reviewed strings below become visitor text or search terms.
"""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GEOJSON = ROOT / "geojson/exhibit.geojson"
REPORT = ROOT / "reports/approved-issue-image-transcriptions.json"

# The fifteen byte-identical blank submissions intentionally have no text.
BLANK = {309, 311, 313, 314, 315, 316, 317, 318, 319, 320, 321, 323, 324, 335, 345}

# Text is transcribed from the selected image, including visible image captions.
# narrative is prose displayed to visitors; labels remain searchable in photo_text.
REVIEWED = {
    303: dict(text="Atlantic wolffish. Anarhichas lupus.", specimens=[("Anarhichas lupus", "Atlantic wolffish")]),
    304: dict(text="Odonata. Dragonflies and damselflies. Calopterygidae, Lestidae, Coenagrionidae, Petaluridae, Aeshnidae, Gomphidae, Cordulegastridae, Macromiidae, Corduliidae, Libellulidae."),
    305: dict(text="Odonata. Dragonflies and damselflies. Eight-spotted skimmer. Libellula forensis.", specimens=[("Libellula forensis", "Eight-spotted skimmer")]),
    306: dict(text="Hemiptera. True bugs."),
    307: dict(text="Lepidoptera. Butterflies and moths. Microlepidoptera. Papilionidae."),
    308: dict(text="Lepidoptera. Butterflies and moths. Hesperiidae, Pieridae, Riodinidae, Lycaenidae. Monarch butterfly. Danaus plexippus.", specimens=[("Danaus plexippus", "Monarch butterfly")]),
    322: dict(text="Why do spawning male sockeye salmon turn red? Scientists believe the vibrant red colour helps make male spawners more visible and attractive to potential mates.", narrative="Why do spawning male sockeye salmon turn red? Scientists believe the vibrant red colour helps make male spawners more visible and attractive to potential mates."),
    325: dict(text="Bovidae. Bovids. Tetrapoda, Amniota, Mammalia, Artiodactyla, Bovidae. American bison. Bison bison.", specimens=[("Bison bison", "American bison")]),
    326: dict(text="Bovids include antelope, goats, sheep, mountain goats, and muskoxen. Water buffalo. Bubalus bubalis.", narrative="Bovids include antelope, goats, sheep, mountain goats, and muskoxen.", specimens=[("Bubalus bubalis", "Water buffalo")]),
    327: dict(text="Hubbs' beaked whale (skull). Mesoplodon carlhubbsi.", specimens=[("Mesoplodon carlhubbsi", "Hubbs' beaked whale")]),
    328: dict(text="Killer whale. Orcinus orca.", specimens=[("Orcinus orca", "Killer whale")]),
    329: dict(text="Dicranaceae. Dicranella, Dicranum."),
    330: dict(text="Dicranaceae. Dicranella, Dicranum, and Paraleucobryum. Land Plants, Bryophyta, Bryopsida, Dicranales, Dicranaceae. Brook moss. Dicranum scoparium.", specimens=[("Dicranum scoparium", "Brook moss")]),
    331: dict(text="Grimmiaceae. Grimmia, Racomitrium."),
    332: dict(text="Grimmiaceae. Grimmia, Racomitrium, and Schistidium. Land Plants, Bryophyta, Bryopsida, Grimmiales, Grimmiaceae. Grey cushion moss. Grimmia pulvinata.", specimens=[("Grimmia pulvinata", "Grey cushion moss")]),
    333: dict(text="Bryophyte leaves are very thin, usually only one cell layer thick, so they absorb nutrients from the atmosphere—and pollutants too! Bryophytes that are sensitive to pollution are sometimes used as pollution indicators. Racomitrium moss. Racomitrium sp.", narrative="Bryophyte leaves are very thin, usually only one cell layer thick, so they absorb nutrients from the atmosphere—and pollutants too! Bryophytes that are sensitive to pollution are sometimes used as pollution indicators.", specimens=[("Racomitrium sp.", "Racomitrium moss")]),
    334: dict(text="Point-cap moss. Racomitrium sp.", specimens=[("Racomitrium sp.", "Point-cap moss")]),
    336: dict(text="Mosses grow in different forms. Moss that grows straight up with little branching is called acrocarpus. Moss that grows along the ground and has branches is called pleurocarpus. Juniper hair-cap moss. Polytrichum juniperinum. Hypnum moss. Hypnum imponens.", narrative="Mosses grow in different forms. Moss that grows straight up with little branching is called acrocarpus. Moss that grows along the ground and has branches is called pleurocarpus.", specimens=[("Polytrichum juniperinum", "Juniper hair-cap moss"), ("Hypnum imponens", "Hypnum moss")]),
    337: dict(text="Pucciniomycetes. Rust fungi and allies. Stem rust (on Senecio). Puccinia lagenophorae.", specimens=[("Puccinia lagenophorae", "Stem rust")]),
    338: dict(text="Rust fungus (on Hypericum). Melampsora hypericorum. 7.8×, 25×, 110×.", specimens=[("Melampsora hypericorum", "Rust fungus")]),
    339: dict(text="Tremellomycetes. Jelly fungi. Yellow brain. Tremella mesenterica.", specimens=[("Tremella mesenterica", "Yellow brain")]),
    340: dict(text="Eurotiomycetes. Penicillin and ringworm. Blue mold. Penicillium chrysogenum.", specimens=[("Penicillium chrysogenum", "Blue mold")]),
    341: dict(text="Peltigera polydactylon.", specimens=[("Peltigera polydactylon", None)]),
    342: dict(text="Fungi play an important role in medical treatments. Penicillin, the first drug found to be effective against infections like syphilis and Staphylococcus, was derived from Penicillium molds. Three scientists were awarded Nobel prizes for their role in the development. Blue mold. Penicillium chrysogenum.", narrative="Fungi play an important role in medical treatments. Penicillin, the first drug found to be effective against infections like syphilis and Staphylococcus, was derived from Penicillium molds. Three scientists were awarded Nobel prizes for their role in the development.", specimens=[("Penicillium chrysogenum", "Blue mold")]),
    343: dict(text="Cicada (cast skin with emerging adult). Tibicen chloromera.", specimens=[("Tibicen chloromera", "Cicada")]),
    344: dict(text="More than 90 per cent of the world's animal species are insects. There may be 10 million or more species of insects in the world. Dock bug. Coreus marginatus.", narrative="More than 90 per cent of the world's animal species are insects. There may be 10 million or more species of insects in the world.", specimens=[("Coreus marginatus", "Dock bug")]),
    346: dict(text="Perhaps the greatest of all advances in vertebrate history was the development of jaws and the consequent revolution in the mode of life of early fishes. Alfred Sherwood Romer, 1968. Coho salmon. Oncorhynchus kisutch.", narrative="“Perhaps the greatest of all advances in vertebrate history was the development of jaws and the consequent revolution in the mode of life of early fishes.” — Alfred Sherwood Romer, 1968", specimens=[("Oncorhynchus kisutch", "Coho salmon")]),
    347: dict(text="Stomiiformes. Bristlemouths and dragonfishes. Chordata, Craniata, Actinopterygii, Teleostei, Stenopterygii, Stomiiformes. Sloane's viperfish. Chauliodus sloani.", specimens=[("Chauliodus sloani", "Sloane's viperfish")]),
    348: dict(text="Oddly enough, some flounders are “right-eyed,” meaning their left eye has migrated across their heads to the right side, and some are “left-eyed,” meaning their right eye has migrated to the left. Righteye flounders. Pleuronectidae.", narrative="Oddly enough, some flounders are “right-eyed,” meaning their left eye has migrated across their heads to the right side, and some are “left-eyed,” meaning their right eye has migrated to the left."),
    349: dict(text="Hymenoptera. Bees, wasps,"),
    350: dict(text="Ants and sawflies."),
    358: dict(text=""),
    359: dict(text="How many toes does this dinosaur have? What were these dinosaurs doing? Do these footprints look familiar?"),
    360: dict(text="Footprints in Time."),
    369: dict(text="Megaloceros giganteus (skull). Irish elk. The Irish elk is an extinct giant deer that lived in what is now Eurasia from about 450,000 years ago to 7,700 years ago. Its antlers reached up to 3.5 metres across, the largest of any known deer. Its closest living relative is the European fallow deer. Caribou. Moose. European fallow deer.", narrative="The Irish elk is an extinct giant deer that lived in what is now Eurasia from about 450,000 years ago to 7,700 years ago. Its antlers reached up to 3.5 metres across, the largest of any known deer. Its closest living relative is the European fallow deer.", specimens=[("Megaloceros giganteus", "Irish elk")]),
}

TAXONOMY = {
    303: {"family_name": "Anarhichadidae"},
    304: {"common_group_name": "Dragonflies and damselflies"},
    305: {"common_group_name": "Dragonflies and damselflies"},
    306: {"common_group_name": "True bugs"},
    307: {"common_group_name": "Butterflies and moths"},
    308: {"common_group_name": "Butterflies and moths"},
    325: {"family_name": "Bovidae", "common_group_name": "Bovids", "tree": ["Tetrapoda", "Amniota", "Mammalia", "Artiodactyla", "Bovidae"]},
    329: {"family_name": "Dicranaceae"},
    330: {"family_name": "Dicranaceae", "tree": ["Land Plants", "Bryophyta", "Bryopsida", "Dicranales", "Dicranaceae"]},
    331: {"family_name": "Grimmiaceae"},
    332: {"family_name": "Grimmiaceae", "tree": ["Land Plants", "Bryophyta", "Bryopsida", "Grimmiales", "Grimmiaceae"]},
    337: {"common_group_name": "Rust fungi and allies", "tree": ["Fungi", "Basidiomycota", "Pucciniomycetes"]},
    339: {"common_group_name": "Jelly fungi", "tree": ["Fungi", "Basidiomycota", "Tremellomycetes"]},
    340: {"common_group_name": "Penicillin and ringworm", "tree": ["Fungi", "Ascomycota", "Eurotiomycetes"]},
    347: {"common_group_name": "Bristlemouths and dragonfishes", "tree": ["Chordata", "Craniata", "Actinopterygii", "Teleostei", "Stenopterygii", "Stomiiformes"]},
    348: {"family_name": "Pleuronectidae", "common_group_name": "Righteye flounders"},
    349: {"common_group_name": "Bees, wasps, ants, and sawflies"},
    350: {"common_group_name": "Bees, wasps, ants, and sawflies"},
}


def main():
    report = json.loads(REPORT.read_text())
    by_url = {item["image_url"]: item for item in report}
    assert len(by_url) == len(report) == 50
    assert set(REVIEWED) | BLANK == {item["issue_number"] for item in report}
    assert not (set(REVIEWED) & BLANK)
    data = json.loads(GEOJSON.read_text())
    matched = set()
    for feature in data["features"]:
        props = feature["properties"]
        url = (props.get("image") or {}).get("url")
        if url not in by_url:
            continue
        ocr = by_url[url]
        issue = ocr["issue_number"]
        selected = REVIEWED.get(issue, {"text": ""})
        matched.add(url)
        assert "error" not in ocr, issue
        # All searchable prose, captions and structured names must derive from
        # the selected photo. A prior archive label may depict another panel.
        props["details"] = {"text": {"en": selected.get("narrative", "")}}
        props["photo_text"] = selected["text"]
        props["specimens"] = [
            {
                "scientificName": scientific,
                "commonName": common,
                "specimenType": None,
                "presence": "referenced",
                "catalogNumber": None,
            }
            for scientific, common in selected.get("specimens", [])
        ]
        if issue in TAXONOMY:
            props["taxonomy"] = TAXONOMY[issue]
        else:
            props.pop("taxonomy", None)
        props["image_transcriptions"] = [{
            "issue_number": issue,
            "image_url": url,
            "engine": ocr["engine"],
            "text": ocr["text"],
            "confidence": ocr.get("confidence", 0),
            "review_status": "machine_transcribed_unreviewed",
        }]
        props["photo_text_source_url"] = url
        props["photo_text_review_status"] = "blank_or_no_legible_exhibit_text" if not selected["text"] else "reviewed_against_image"
    assert matched == set(by_url), (len(matched), len(by_url))
    GEOJSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"Applied reviewed text to {len(matched)} approved images; {sum(not REVIEWED.get(item['issue_number'], {}).get('text') for item in report)} have no exhibit text")


if __name__ == "__main__":
    main()
