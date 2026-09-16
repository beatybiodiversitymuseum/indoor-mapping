import Foundation
import Vision
let paths = Array(CommandLine.arguments.dropFirst())
for path in paths {
    do {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.003
        try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first }.filter { $0.confidence >= 0.3 }
        let record: [String: Any] = ["path": path, "text": lines.map { $0.string }.joined(separator: "\n"), "confidence": lines.isEmpty ? 0 : lines.map { Double($0.confidence) }.reduce(0,+)/Double(lines.count)]
        let data = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
        print(String(data: data, encoding: .utf8)!)
    } catch { print("{\"path\":\"\(path)\",\"error\":\"OCR failed\"}") }
}
