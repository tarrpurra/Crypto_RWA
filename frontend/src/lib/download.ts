export function downloadTextFile(contents: string, filename: string, mimeType = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([contents], { type: mimeType });
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}
