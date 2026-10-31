// OpenRouter, the server half: OpenRouter's unified API as a kind of connection, translated to and
// from the app's neutral vocabulary.

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';
const REFERER = 'https://github.com/Sillyanonymous/ProjectSigma';
const TITLE = 'Project Sigma';

const VALID_SORTS = new Set(['price', 'throughput', 'latency']);

function slugList(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function register(router, ctx) {
    const { LlmError, classifyUpstream, boundedErrorText, networkError, readJsonBody, parseSse, translateParams } = ctx.llm.kit;

    // Track the library db for each profileId when llm.request runs so buildBody can read
    // account-scoped provider routing settings without changing the adapter call signature.
    const dbByProfile = new Map();
    let lastDb = null;

    ctx.hooks.add('llm.request', (req, facts) => {
        if (facts?.db) {
            lastDb = facts.db;
            if (facts.profileId) dbByProfile.set(facts.profileId, facts.db);
        }
        return req;
    });

    const PARAMS = {
        temperature: 'temperature',
        topP: 'top_p',
        topK: 'top_k',
        maxTokens: 'max_tokens',
        stop: 'stop',
        presencePenalty: 'presence_penalty',
        frequencyPenalty: 'frequency_penalty',
        seed: 'seed',
        json: (on, body) => { if (on) body.response_format = { type: 'json_object' }; },
        // OpenRouter normalizes thinking across Claude, DeepSeek R1, Gemini, o-series, etc. via `reasoning`
        reasoning: (r, body) => { body.reasoning = { effort: r.effort }; },
    };

    const baseOf = (profile) => String(profile.base_url || DEFAULT_BASE).replace(/\/+$/, '');
    const headers = (profile) => ({
        'Content-Type': 'application/json',
        'HTTP-Referer': REFERER,
        'X-Title': TITLE,
        ...(profile.api_key ? { Authorization: `Bearer ${profile.api_key}` } : {}),
    });

    // A message's images go ahead of its text as data URL parts; the neutral field never reaches the wire.
    function wireMessage({ images, ...m }) {
        if (!images?.length) return m;
        const text = typeof m.content === 'string'
            ? (m.content ? [{ type: 'text', text: m.content }] : [])
            : (Array.isArray(m.content) ? m.content : []);
        return {
            ...m,
            content: [
                ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.data}` } })),
                ...text,
            ],
        };
    }

    function providerRouting(profile) {
        const db = (profile?.id && dbByProfile.get(profile.id)) || lastDb;
        if (!db) return null;
        try {
            const sort = String(ctx.setting(db, 'sort') || '').trim();
            const order = slugList(ctx.setting(db, 'order'));
            const ignore = slugList(ctx.setting(db, 'ignore'));
            const allowFallbacks = ctx.setting(db, 'allowFallbacks') !== false;
            const dataCollection = ctx.setting(db, 'dataCollection') === 'deny' ? 'deny' : 'allow';
            const zdr = !!ctx.setting(db, 'zdr');

            const provider = {};
            if (VALID_SORTS.has(sort)) provider.sort = sort;
            if (order.length) provider.order = order;
            if (ignore.length) provider.ignore = ignore;
            if (!allowFallbacks) provider.allow_fallbacks = false;
            if (dataCollection === 'deny') provider.data_collection = 'deny';
            if (zdr) provider.zdr = true;
            return Object.keys(provider).length ? provider : null;
        } catch {
            return null;
        }
    }

    function buildBody(profile, req, stream) {
        const body = {
            model: req.model || profile.model || undefined,
            messages: req.messages.map(wireMessage),
            stream,
        };
        translateParams(req.params || {}, PARAMS, body, { debug: req.debug });
        const provider = providerRouting(profile);
        if (provider) body.provider = provider;
        return body;
    }

    function contentOf(choice) {
        let content = choice?.message?.content;
        if (Array.isArray(content)) content = content.filter(b => b?.type === 'text').map(b => b.text).join('');
        if (typeof content !== 'string') content = choice?.text ?? '';
        return content;
    }

    function reasoningOf(holder) {
        if (!holder) return '';
        const direct = holder.reasoning ?? holder.reasoning_content;
        if (typeof direct === 'string' && direct) return direct;
        if (Array.isArray(holder.reasoning_details)) {
            return holder.reasoning_details
                .map(d => (typeof d?.text === 'string' ? d.text : (typeof d?.summary === 'string' ? d.summary : '')))
                .join('');
        }
        return '';
    }

    function listedVision(m) {
        const modalities = m?.architecture?.input_modalities ?? m?.input_modalities;
        if (Array.isArray(modalities)) return { vision: modalities.includes('image') };
        if (typeof m?.capabilities?.vision === 'boolean') return { vision: m.capabilities.vision };
        return {};
    }

    // OpenRouter often wraps upstream errors in a 200 body or SSE frame with { error: { code, message, metadata } }.
    function openRouterError(data, fallbackStatus = 502) {
        const err = data?.error;
        const code = Number(err?.code);
        const status = Number.isFinite(code) && code >= 100 && code < 600 ? code : fallbackStatus;
        let msg = typeof err === 'string' ? err : (err?.message || '');
        const raw = err?.metadata?.raw;
        const providerName = err?.metadata?.provider_name;
        if (typeof raw === 'string' && raw.trim() && (!msg || msg === 'Provider returned error')) {
            msg = providerName ? `${providerName}: ${raw}` : raw;
        } else if (providerName && msg && !msg.includes(providerName)) {
            msg = `${providerName}: ${msg}`;
        }
        return classifyUpstream({ status }, JSON.stringify({ error: { message: msg || JSON.stringify(err) } }));
    }

    async function request(profile, path, init, signal) {
        let resp;
        try {
            resp = await fetch(`${baseOf(profile)}${path}`, { ...init, signal });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw networkError(err);
        }
        if (!resp.ok) {
            const text = await boundedErrorText(resp);
            try {
                const parsed = JSON.parse(text);
                if (parsed?.error) throw openRouterError(parsed, resp.status);
            } catch (e) {
                if (e instanceof LlmError) throw e;
            }
            throw classifyUpstream(resp, text);
        }
        return resp;
    }

    ctx.llm.registerAdapter({
        kind: 'openrouter',
        displayName: 'OpenRouter',
        defaultBaseUrl: DEFAULT_BASE,
        requiresBaseUrl: false,
        capabilities: { streaming: true, json: true, reasoning: true, vision: true },
        paramTable: PARAMS,

        async chat(profile, req, signal) {
            const resp = await request(profile, '/chat/completions', {
                method: 'POST', headers: headers(profile), body: JSON.stringify(buildBody(profile, req, false)),
            }, signal);
            const data = await readJsonBody(resp, signal);
            if (data?.error) throw openRouterError(data, resp.status);
            const choice = data?.choices?.[0];
            if (!choice) throw new LlmError('upstream', 'unrecognized response shape');
            const content = contentOf(choice);
            if (typeof content !== 'string') throw new LlmError('upstream', 'unrecognized response shape');
            const reasoning = reasoningOf(choice.message);
            return {
                content,
                ...(reasoning ? { reasoning } : {}),
                finishReason: choice.finish_reason ?? null,
                ...(data.usage ? { usage: data.usage } : {}),
            };
        },

        async *chatStream(profile, req, signal) {
            const resp = await request(profile, '/chat/completions', {
                method: 'POST', headers: headers(profile), body: JSON.stringify(buildBody(profile, req, true)),
            }, signal);
            let finishReason = null;
            let usage;
            let ended = false;
            let read = false;
            for await (const frame of parseSse(resp.body, signal)) {
                if (frame.data === '[DONE]') { ended = true; break; }
                let data;
                try { data = JSON.parse(frame.data); } catch { continue; }
                read = true;
                if (data?.error) throw openRouterError(data, 502);
                const choice = data?.choices?.[0];
                const delta = choice?.delta;
                if (typeof delta?.content === 'string' && delta.content) yield { text: delta.content };
                const reasoning = reasoningOf(delta);
                if (reasoning) yield { reasoning };
                if (choice?.finish_reason) finishReason = choice.finish_reason;
                if (data?.usage) usage = data.usage;
            }
            if (!ended && !finishReason && !read) throw new LlmError('upstream', 'unrecognized response shape');
            if (!ended && !finishReason) throw new LlmError('network', 'the reply stream ended before the endpoint finished the reply', { retryable: true });
            yield { done: { finishReason, ...(usage ? { usage } : {}) } };
        },

        async listModels(profile, signal) {
            const resp = await request(profile, '/models', { method: 'GET', headers: headers(profile) }, signal);
            const data = await readJsonBody(resp, signal);
            const rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : null);
            if (!rows) throw new LlmError('upstream', 'unrecognized response shape');
            return rows
                .map(m => {
                    const ctxLen = m?.top_provider?.context_length ?? m?.context_length;
                    return {
                        id: String(m?.id ?? m?.name ?? ''),
                        ...(Number.isFinite(ctxLen) && ctxLen > 0 ? { contextLength: ctxLen } : {}),
                        ...listedVision(m),
                    };
                })
                .filter(m => m.id)
                .sort((a, b) => a.id.localeCompare(b.id));
        },
    });
}
