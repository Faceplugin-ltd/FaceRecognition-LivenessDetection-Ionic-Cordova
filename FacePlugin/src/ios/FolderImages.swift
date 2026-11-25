import Foundation
import UniformTypeIdentifiers

enum FolderImages {
  static let exts: Set<String> = ["png", "jpg", "jpeg", "heic", "heif", "bmp", "webp"]

  static func list(folder: URL) -> [[String: String]] {
    let access = folder.startAccessingSecurityScopedResource()
    defer {
      if access {
        folder.stopAccessingSecurityScopedResource()
      }
    }
    let fm = FileManager.default
    let items =
      (try? fm.contentsOfDirectory(
        at: folder,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
      )) ?? []
    let tmp = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
      .appendingPathComponent("frs_import", isDirectory: true)
    try? fm.createDirectory(at: tmp, withIntermediateDirectories: true)
    var out: [[String: String]] = []
    for url in items.sorted(by: {
      $0.lastPathComponent.lowercased() < $1.lastPathComponent.lowercased()
    }) {
      guard exts.contains(url.pathExtension.lowercased()) else { continue }
      var dest = tmp.appendingPathComponent(url.lastPathComponent)
      var n = 1
      while fm.fileExists(atPath: dest.path) {
        dest = tmp.appendingPathComponent(
          "\(url.deletingPathExtension().lastPathComponent)-\(n).\(url.pathExtension)"
        )
        n += 1
      }
      do {
        try fm.copyItem(at: url, to: dest)
        out.append(["uri": dest.absoluteString, "fileName": dest.lastPathComponent])
      } catch {
        continue
      }
    }
    return out
  }
}
