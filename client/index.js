// OpenRouter client half: provider routing preferences in Settings > Extensions.

export default {
    init(ctx) {
        const esc = (s) => ctx.CoreAPI.escapeHtml(String(s ?? ''));

        ctx.ui.addSettingsSection((el) => {
            const draw = () => {
                const sort = String(ctx.settings.get('sort') || '');
                const order = esc(ctx.settings.get('order') || '');
                const ignore = esc(ctx.settings.get('ignore') || '');
                const allowFallbacks = ctx.settings.get('allowFallbacks') !== false;
                const dataCollection = String(ctx.settings.get('dataCollection') || 'allow');
                const zdr = !!ctx.settings.get('zdr');

                el.innerHTML = `
                    <div class="settings-row">
                        <label for="or-sort">Sort providers by</label>
                        <select id="or-sort" class="glass-input" data-or-set="sort">
                            <option value=""${sort === '' ? ' selected' : ''}>Default (OpenRouter balanced)</option>
                            <option value="price"${sort === 'price' ? ' selected' : ''}>Price (lowest cost first)</option>
                            <option value="throughput"${sort === 'throughput' ? ' selected' : ''}>Throughput (fastest tokens/sec)</option>
                            <option value="latency"${sort === 'latency' ? ' selected' : ''}>Latency (fastest first token)</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label for="or-order">Preferred providers (order)</label>
                        <input id="or-order" type="search" autocomplete="off" spellcheck="false" class="glass-input" data-or-set="order" value="${order}" placeholder="e.g. anthropic, google-vertex, fireworks">
                        <span class="settings-hint">Comma-separated OpenRouter provider slugs to try first, in order.</span>
                    </div>
                    <div class="settings-row">
                        <label for="or-ignore">Ignored providers (ignore)</label>
                        <input id="or-ignore" type="search" autocomplete="off" spellcheck="false" class="glass-input" data-or-set="ignore" value="${ignore}" placeholder="e.g. deepinfra, together">
                        <span class="settings-hint">Comma-separated provider slugs to skip for every request.</span>
                    </div>
                    <div class="settings-row">
                        <label><input type="checkbox" class="cl-switch-input" data-or-bool="allowFallbacks"${allowFallbacks ? ' checked' : ''}><span class="cl-switch" aria-hidden="true"></span> Allow backup providers if preferred ones fail</label>
                    </div>
                    <div class="settings-row">
                        <label for="or-data">Data collection policy</label>
                        <select id="or-data" class="glass-input" data-or-set="dataCollection">
                            <option value="allow"${dataCollection !== 'deny' ? ' selected' : ''}>Allow all providers</option>
                            <option value="deny"${dataCollection === 'deny' ? ' selected' : ''}>Deny providers that train on or log prompts</option>
                        </select>
                    </div>
                    <div class="settings-row">
                        <label><input type="checkbox" class="cl-switch-input" data-or-bool="zdr"${zdr ? ' checked' : ''}><span class="cl-switch" aria-hidden="true"></span> Zero Data Retention (ZDR) endpoints only</label>
                    </div>`;

                for (const input of el.querySelectorAll('[data-or-set]')) {
                    input.addEventListener('change', () => {
                        ctx.settings.set(input.dataset.orSet, input.value.trim());
                    });
                }
                for (const input of el.querySelectorAll('[data-or-bool]')) {
                    input.addEventListener('change', () => {
                        ctx.settings.set(input.dataset.orBool, !!input.checked);
                    });
                }
            };
            draw();
        });
    },
};
