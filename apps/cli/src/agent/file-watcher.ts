import { watch } from "fs";
import { join } from "path";

type ChangeCallback = (event: string, filename: string) => void;

export function watchHarenDir(harenDir: string, onChange: ChangeCallback): () => void {
  const artifactsDir = join(harenDir, "artifacts");
  const progressPath = join(harenDir, "progress.json");

  const watchers: ReturnType<typeof watch>[] = [];

  try {
    const w = watch(progressPath, (event) => {
      onChange(event, "progress.json");
    });
    watchers.push(w);
  } catch {}

  try {
    const w = watch(artifactsDir, { recursive: true }, (event, filename) => {
      if (filename) {
        onChange(event, `artifacts/${filename}`);
      }
    });
    watchers.push(w);
  } catch {}

  return () => {
    for (const w of watchers) {
      w.close();
    }
  };
}
