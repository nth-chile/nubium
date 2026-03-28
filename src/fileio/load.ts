import { deserialize } from "../serialization";
import { importFromMusicXML } from "../musicxml";
import JSZip from "jszip";
import type { Score } from "../model";

function isMusicXML(content: string): boolean {
  const trimmed = content.trimStart();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<score-partwise")
  );
}

function isMusicXMLExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".musicxml") || lower.endsWith(".xml");
}

function isMxlExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith(".mxl");
}

async function extractMxl(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  // MXL contains a META-INF/container.xml pointing to the main file,
  // but most MXLs just have one .xml file at the root
  const containerXml = zip.file("META-INF/container.xml");
  if (containerXml) {
    const containerText = await containerXml.async("string");
    const match = containerText.match(/full-path="([^"]+)"/);
    if (match) {
      const mainFile = zip.file(match[1]);
      if (mainFile) return mainFile.async("string");
    }
  }
  // Fallback: find any .xml file that looks like MusicXML
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith(".xml") && !name.startsWith("META-INF")) {
      const content = await file.async("string");
      if (isMusicXML(content)) return content;
    }
  }
  throw new Error("No MusicXML file found in .mxl archive");
}

function isJsonContent(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith("{");
}

function parseContent(content: string, filename: string): Score {
  if (isMusicXMLExtension(filename) || isMusicXML(content)) {
    return importFromMusicXML(content);
  }
  // JSON-based .notation files (new format) and any JSON content
  if (isJsonContent(content)) {
    return deserialize(content);
  }
  // Legacy: old text-based .notation format — attempt JSON parse anyway
  // (will throw a clear error if it's truly the old format)
  return deserialize(content);
}

export async function loadScore(): Promise<{ score: Score; path: string } | null> {
  // Try Tauri native file dialog
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await open({
      filters: [
        { name: "All Supported", extensions: ["notation", "json", "musicxml", "mxl", "xml"] },
        { name: "Notation Score", extensions: ["notation", "json"] },
        { name: "MusicXML", extensions: ["musicxml", "mxl", "xml"] },
      ],
      multiple: false,
    });

    if (!path) return null;

    if (isMxlExtension(path as string)) {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const buf = await readFile(path as string);
      const xml = await extractMxl(buf.buffer as ArrayBuffer);
      const score = importFromMusicXML(xml);
      return { score, path: path as string };
    }
    const content = await readTextFile(path as string);
    const score = parseContent(content, path as string);
    return { score, path: path as string };
  } catch {
    // Fallback: browser file input
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".notation,.json,.musicxml,.mxl,.xml";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        if (isMxlExtension(file.name)) {
          const buf = await file.arrayBuffer();
          const xml = await extractMxl(buf);
          const score = importFromMusicXML(xml);
          resolve({ score, path: file.name });
          return;
        }
        const text = await file.text();
        const score = parseContent(text, file.name);
        resolve({ score, path: file.name });
      };
      input.click();
    });
  }
}
