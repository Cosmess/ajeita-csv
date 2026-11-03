import { useCallback, useRef, useState } from "react";
import { getWorkerClient } from "../worker";

const BLOCK_SIZE = 100;
const MAX_BLOCKS = 200;

type Block = { indices: number[]; rows: string[][] };
export type CachedRow = { index: number; cells: string[] };

// Busca no worker só os blocos de linhas que estão (ou vão ficar) visíveis.
// Uma nova viewVersion invalida tudo: a ordem ou o arquivo mudaram.
export function useRowCache(viewVersion: number, viewCount: number) {
  const [, setLoaded] = useState(0);
  const state = useRef({ version: viewVersion, blocks: new Map<number, Block>(), pending: new Set<number>() });
  if (state.current.version !== viewVersion) {
    state.current = { version: viewVersion, blocks: new Map(), pending: new Set() };
  }

  const ensure = useCallback(
    (start: number, end: number) => {
      const current = state.current;
      const first = Math.floor(start / BLOCK_SIZE);
      const last = Math.floor(Math.max(start, end - 1) / BLOCK_SIZE);
      for (let block = first; block <= last && block * BLOCK_SIZE < viewCount; block++) {
        if (current.blocks.has(block) || current.pending.has(block)) continue;
        current.pending.add(block);
        getWorkerClient()
          .request("getRows", { start: block * BLOCK_SIZE, count: BLOCK_SIZE })
          .then((page) => {
            current.pending.delete(block);
            if (page.viewVersion !== current.version || state.current !== current) return;
            current.blocks.set(block, page);
            if (current.blocks.size > MAX_BLOCKS) {
              const oldest = current.blocks.keys().next().value;
              if (oldest !== undefined && oldest !== block) current.blocks.delete(oldest);
            }
            setLoaded((n) => n + 1);
          })
          .catch(() => current.pending.delete(block));
      }
    },
    [viewCount],
  );

  const getRow = useCallback((position: number): CachedRow | undefined => {
    const block = state.current.blocks.get(Math.floor(position / BLOCK_SIZE));
    const offset = position % BLOCK_SIZE;
    const cells = block?.rows[offset];
    return block && cells ? { index: block.indices[offset]!, cells } : undefined;
  }, []);

  return { ensure, getRow };
}
