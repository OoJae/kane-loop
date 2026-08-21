#!/usr/bin/env node
/**
 * A ~70-line shim that lets Claude Code talk to an Anthropic-compatible endpoint
 * whose model name it does not recognise.
 *
 * The standoff: Claude Code validates the model name before sending and refuses
 * anything outside its known list (`[claude-code:unrecognized_model]`), while
 * this provider accepts only its own name and 400s on every Claude one
 * ("Unsupported model claude-sonnet-4-5-…"). Neither side will budge, so the
 * request is rewritten in flight: Claude Code sends a name it is happy with, and
 * this swaps in the one the provider wants.
 *
 * Only `model` is touched. Everything else — headers, streaming, tool calls —
 * is passed through untouched, because the wire format is already Anthropic's.
 *
 *   UPSTREAM_BASE_URL  provider base, e.g. https://host/anthropic
 *   UPSTREAM_MODEL     the name to substitute, e.g. mimo-v2.5-pro
 *   PROXY_PORT         listen port (default 4010)
 */
import http from 'node:http'
import { Buffer } from 'node:buffer'

const UPSTREAM = new URL(process.env.UPSTREAM_BASE_URL ?? '')
const MODEL = process.env.UPSTREAM_MODEL ?? ''
const PORT = Number(process.env.PROXY_PORT ?? 4010)

if (UPSTREAM.href === '' || MODEL === '') {
  console.error('[model-proxy] UPSTREAM_BASE_URL and UPSTREAM_MODEL are required')
  process.exit(1)
}

const transport = UPSTREAM.protocol === 'https:' ? await import('node:https') : http

const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = Buffer.concat(chunks)

    // Requests are small (a prompt plus tool definitions), so buffering to
    // rewrite one field is cheap. Responses are streamed, not buffered.
    if (body.length > 0) {
      try {
        const parsed = JSON.parse(body.toString('utf8'))
        if (typeof parsed === 'object' && parsed !== null && 'model' in parsed) {
          parsed.model = MODEL
          body = Buffer.from(JSON.stringify(parsed), 'utf8')
        }
      } catch {
        // Not JSON — forward untouched.
      }
    }

    const headers = { ...req.headers }
    delete headers['host']
    delete headers['content-length']
    if (body.length > 0) headers['content-length'] = String(body.length)

    const basePath = UPSTREAM.pathname.replace(/\/+$/, '')
    const upstreamReq = transport.request(
      {
        protocol: UPSTREAM.protocol,
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port || (UPSTREAM.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: `${basePath}${req.url}`,
        headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        // Piped, so server-sent events arrive token by token rather than in one
        // lump at the end — the transcript pane depends on that.
        upstreamRes.pipe(res)
      },
    )

    upstreamReq.on('error', (err) => {
      console.error('[model-proxy] upstream error:', err.message)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { message: `upstream: ${err.message}` } }))
    })

    if (body.length > 0) upstreamReq.write(body)
    upstreamReq.end()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[model-proxy] :${PORT} → ${UPSTREAM.origin}${UPSTREAM.pathname} as ${MODEL}`)
})
