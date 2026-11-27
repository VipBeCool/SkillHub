import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RemotePromptItem, RemotePromptListResponse } from '../types/resourceHub';

export interface PromptsChatQueryParams {
  query?: string;
  sort?: 'upvotes' | 'newest';
  promptType?: 'all' | 'TEXT' | 'STRUCTURED';
  page?: number;
  perPage?: number;
  forceRefresh?: boolean;
  append?: boolean;
}

/**
 * 远程开源提示词广场数据管理 Hook（AiShort / prompts.chat / Fabric / LangGPT）
 */
export function usePromptHub() {
  // === 1. AiShort 中文精选 ===
  const [aishortResp, setAishortResp] = useState<RemotePromptListResponse | null>(null);
  const [aishortLoading, setAishortLoading] = useState(false);
  const [aishortError, setAishortError] = useState<string | null>(null);
  const aishortInFlightRef = useRef(false);

  // === 2. prompts.chat 全球社区 ===
  const [promptsChatItems, setPromptsChatItems] = useState<RemotePromptItem[]>([]);
  const [promptsChatMeta, setPromptsChatMeta] = useState<{
    total: number;
    page: number;
    hasMore: boolean;
    usedFallback: boolean;
  }>({ total: 0, page: 1, hasMore: false, usedFallback: false });
  const [promptsChatLoading, setPromptsChatLoading] = useState(false);
  const [promptsChatError, setPromptsChatError] = useState<string | null>(null);
  const promptsChatReqIdRef = useRef(0);

  // === 3. Fabric 专业工作流 ===
  const [fabricResp, setFabricResp] = useState<RemotePromptListResponse | null>(null);
  const [fabricLoading, setFabricLoading] = useState(false);
  const [fabricError, setFabricError] = useState<string | null>(null);
  const fabricInFlightRef = useRef(false);
  const fabricContentCacheRef = useRef<Map<string, string>>(new Map());

  // === 4. LangGPT 结构化模板 ===
  const [langgptResp, setLanggptResp] = useState<RemotePromptListResponse | null>(null);
  const [langgptLoading, setLanggptLoading] = useState(false);
  const [langgptError, setLanggptError] = useState<string | null>(null);
  const langgptInFlightRef = useRef(false);

  const fetchAishort = useCallback(
    async (forceRefresh = false): Promise<RemotePromptListResponse | null> => {
      if (!forceRefresh && aishortResp) return aishortResp;
      if (aishortInFlightRef.current) return null;
      aishortInFlightRef.current = true;
      setAishortLoading(true);
      setAishortError(null);
      try {
        const res = await invoke<RemotePromptListResponse>('fetch_aishort_prompts', {
          forceRefresh,
        });
        setAishortResp(res);
        return res;
      } catch (err) {
        setAishortError(String(err));
        return null;
      } finally {
        aishortInFlightRef.current = false;
        setAishortLoading(false);
      }
    },
    [aishortResp]
  );

  const searchPromptsChat = useCallback(
    async (params: PromptsChatQueryParams = {}): Promise<RemotePromptListResponse | null> => {
      const reqId = ++promptsChatReqIdRef.current;
      const {
        query = '',
        sort = 'upvotes',
        promptType = 'all',
        page = 1,
        perPage = 24,
        forceRefresh = false,
        append = false,
      } = params;

      setPromptsChatLoading(true);
      setPromptsChatError(null);
      try {
        const res = await invoke<RemotePromptListResponse>('search_prompts_chat', {
          query: query || null,
          sort,
          promptType,
          page,
          perPage,
          forceRefresh,
        });
        // 忽略过期请求，防止快速输入导致乱序覆盖
        if (reqId !== promptsChatReqIdRef.current) return null;

        setPromptsChatItems(prev => {
          if (!append) return res.items;
          const seen = new Set(prev.map(i => i.id));
          const merged = [...prev];
          for (const item of res.items) {
            if (!seen.has(item.id)) {
              merged.push(item);
            }
          }
          return merged;
        });
        setPromptsChatMeta({
          total: res.total,
          page: res.page,
          hasMore: res.hasMore,
          usedFallback: res.usedFallback,
        });
        return res;
      } catch (err) {
        if (reqId === promptsChatReqIdRef.current) {
          setPromptsChatError(String(err));
        }
        return null;
      } finally {
        if (reqId === promptsChatReqIdRef.current) {
          setPromptsChatLoading(false);
        }
      }
    },
    []
  );

  const fetchFabric = useCallback(
    async (forceRefresh = false): Promise<RemotePromptListResponse | null> => {
      if (!forceRefresh && fabricResp) return fabricResp;
      if (fabricInFlightRef.current) return null;
      fabricInFlightRef.current = true;
      setFabricLoading(true);
      setFabricError(null);
      try {
        const res = await invoke<RemotePromptListResponse>('fetch_fabric_patterns', {
          forceRefresh,
        });
        setFabricResp(res);
        return res;
      } catch (err) {
        setFabricError(String(err));
        return null;
      } finally {
        fabricInFlightRef.current = false;
        setFabricLoading(false);
      }
    },
    [fabricResp]
  );

  const fetchFabricContent = useCallback(
    async (patternName: string, forceRefresh = false): Promise<string> => {
      if (!forceRefresh) {
        const cached = fabricContentCacheRef.current.get(patternName);
        if (cached) return cached;
      }
      const content = await invoke<string>('fetch_fabric_pattern_content', {
        patternName,
        forceRefresh,
      });
      fabricContentCacheRef.current.set(patternName, content);
      return content;
    },
    []
  );

  const fetchLanggpt = useCallback(
    async (forceRefresh = false): Promise<RemotePromptListResponse | null> => {
      if (!forceRefresh && langgptResp) return langgptResp;
      if (langgptInFlightRef.current) return null;
      langgptInFlightRef.current = true;
      setLanggptLoading(true);
      setLanggptError(null);
      try {
        const res = await invoke<RemotePromptListResponse>('fetch_langgpt_prompts', {
          forceRefresh,
        });
        setLanggptResp(res);
        return res;
      } catch (err) {
        setLanggptError(String(err));
        return null;
      } finally {
        langgptInFlightRef.current = false;
        setLanggptLoading(false);
      }
    },
    [langgptResp]
  );

  return {
    aishortResp,
    aishortLoading,
    aishortError,
    fetchAishort,

    promptsChatItems,
    promptsChatMeta,
    promptsChatLoading,
    promptsChatError,
    searchPromptsChat,

    fabricResp,
    fabricLoading,
    fabricError,
    fetchFabric,
    fetchFabricContent,

    langgptResp,
    langgptLoading,
    langgptError,
    fetchLanggpt,
  };
}
