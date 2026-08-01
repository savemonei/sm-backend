/**
 * Knowledge packs — precompressed JSON served from deploy artifacts.
 * GET /knowledge/manifest|features|faq|guides
 */
import { Router } from "express";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Request, Response } from "../types/handlers";

const router = Router();

const KNOWLEDGE_FILES = ["manifest", "features", "faq", "guides"] as const;
type KnowledgeFileName = (typeof KNOWLEDGE_FILES)[number];

type EtagMap = Partial<Record<KnowledgeFileName, string>>;

let etagCache: EtagMap | null = null;

function knowledgeDir(): string {
  return join(process.cwd(), "dist", "data", "knowledge");
}

function loadEtags(): EtagMap {
  if (etagCache) return etagCache;
  const etagPath = join(knowledgeDir(), "etags.json");
  if (!existsSync(etagPath)) {
    etagCache = {};
    return etagCache;
  }
  try {
    etagCache = JSON.parse(readFileSync(etagPath, "utf8")) as EtagMap;
  } catch {
    etagCache = {};
  }
  return etagCache;
}

function isKnowledgeFile(name: string): name is KnowledgeFileName {
  return (KNOWLEDGE_FILES as readonly string[]).includes(name);
}

function sendGzipJson(req: Request, res: Response, name: KnowledgeFileName): void {
  const filePath = join(knowledgeDir(), `${name}.json.gz`);
  if (!existsSync(filePath)) {
    res.status(503).json({
      error: {
        code: "knowledge_not_built",
        message: "Knowledge packs are not built. Run pnpm knowledge:build",
      },
    });
    return;
  }

  const etags = loadEtags();
  const etag = etags[name];
  if (etag) {
    res.setHeader("ETag", etag);
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Vary", "Accept-Encoding");

  createReadStream(filePath).pipe(res);
}

router.get("/manifest", (req: Request, res: Response) => {
  sendGzipJson(req, res, "manifest");
});

router.get("/features", (req: Request, res: Response) => {
  sendGzipJson(req, res, "features");
});

router.get("/faq", (req: Request, res: Response) => {
  sendGzipJson(req, res, "faq");
});

router.get("/guides", (req: Request, res: Response) => {
  sendGzipJson(req, res, "guides");
});

router.get("/:name", (req: Request, res: Response) => {
  const name = String(req.params.name ?? "");
  if (!isKnowledgeFile(name)) {
    return res.status(404).json({
      error: { code: "not_found", message: `Unknown knowledge file: ${name}` },
    });
  }
  sendGzipJson(req, res, name);
});

export default router;
