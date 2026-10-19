/* MIT - LydiaTools */
(function () {
  'use strict';
  const integrations = ['none', 'muse', 'grok', 'codex'];
  const workflows = ['none', 'cloud_browser', 'content_entry', 'data_validation', 'social_ops'];
  function compose(data, profile, integration = 'none', workflow = 'none') {
    if (!Object.hasOwn(data.profiles, profile) || !Array.isArray(data.profiles[profile]) || !integrations.includes(integration) || !workflows.includes(workflow)) throw new Error('Choose a supported profile, integration contract and workflow.');
    const files = data.profiles[profile].map(id => data.modules[id]);
    if (integration !== 'none') files.push('integrations/' + integration + '.txt');
    if (workflow !== 'none') files.push('workflows/' + workflow + '.txt');
    if (files.some(p => !Object.hasOwn(data.files, p) || typeof data.files[p] !== 'string')) throw new Error('A selected source file is unavailable.');
    const text = files.map(p => data.files[p]).join('\n');
    return {text, files, bytes: new TextEncoder().encode(text).length, filename: `blueprint-${profile}${integration === 'none' ? '' : '-' + integration}${workflow === 'none' ? '' : '-' + workflow}.txt`};
  }
  async function digest(text) {
    const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(result)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const api = {compose, digest, integrations, workflows};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.BlueprintBuilder = api;
})();
