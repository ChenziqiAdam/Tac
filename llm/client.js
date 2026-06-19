const https = require('https');
const http = require('http');
const { URL } = require('url');

class LLMClient {
  constructor(config) {
    this.config = config;
  }

  async complete(messages) {
    const base = this.config.base_url.replace(/\/+$/, '');
    const url = new URL(`${base}/chat/completions`);
    const body = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.system_prompt },
        ...messages,
      ],
      max_tokens: 1000,
      enable_thinking: false,
    });

    return new Promise((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          timeout: (this.config.request_timeout_seconds || 30) * 1000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const raw = parsed.choices?.[0]?.message?.content;
              if (!raw) throw new Error('empty content');
              // Strip <think>...</think> blocks (Qwen3 chain-of-thought).
              // If token limit cut off the thinking mid-stream, there's no closing tag —
              // strip everything up to and including the last </think>, or the whole block.
              const content = raw
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<think>[\s\S]*$/, '')
                .trim();
              // Try direct JSON parse first, then extract JSON block from markdown/prose
              try {
                resolve(JSON.parse(content));
              } catch {
                const match = content.match(/\{[\s\S]*\}/);
                if (!match) throw new Error('no JSON found');
                resolve(JSON.parse(match[0]));
              }
            } catch (e) {
              console.error('LLM raw response:', data);
              reject(new Error(`LLM parse error: ${e.message}`));
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error('request timed out'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = LLMClient;
