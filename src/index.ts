export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    const targetPath = url.pathname.slice(1);

    // Handle favicon
    if (url.pathname === "/favicon.ico") {
      return Response.redirect("https://jacklehamster.github.io/proxy-worker/icon.png");
    }

    // Root URL: Clear cookie and show form
    if (!targetPath) {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Proxy URL</title>
            <style>
              body { font-family: Arial; text-align: center; padding: 50px; }
              input { width: 300px; padding: 10px; font-size: 16px; }
              #error { color: red; margin-top: 10px; }
            </style>
          </head>
          <body>
            <h2>Enter Target URL</h2>
            <input id="urlInput" placeholder="e.g., upload.wikimedia.org/..." autofocus>
            <div id="error"></div>
            <script>
              const input = document.getElementById("urlInput");
              const error = document.getElementById("error");
              input.onkeypress = (e) => {
                if (e.keyCode === 13) {
                  let url = input.value.trim();
                  if (!url) { error.textContent = "No target URL"; return; }
                  url = url.replace(/^https?:\\/\\//, "").replace(/^wss?:\\/\\//, "");
                  window.location = \`/\${url}\`;
                }
              };
            </script>
          </body>
        </html>
      `;
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Set-Cookie": "proxied_domain=; Path=/; Max-Age=0",
        },
      });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Cookie,X-Api-Key,Connection,Upgrade,Sec-WebSocket-Key,Sec-WebSocket-Version,Sec-WebSocket-Protocol,Sec-WebSocket-Extensions",
          "Access-Control-Max-Age": "86400",
        },
        status: 204,
      });
    }

    // Get target domain
    let proxyUrl;
    let targetDomain = null;
    let setCookie = false;
    const isWebSocket = request.headers.get('Upgrade') === 'websocket' && request.headers.get('Connection')?.toLowerCase().includes('upgrade');

    const cookies = request.headers.get('Cookie') || '';
    const cookieMatch = cookies.match(/proxied_domain=([^;]+)/);

    if (cookieMatch) {
      // Relative path (e.g., "image.jpg" or "socket")
      targetDomain = cookieMatch[1];
      try {
        const protocol = isWebSocket ? 'wss://' : 'https://';
        const parsedDomain = new URL(`${protocol}${targetDomain}`);
        proxyUrl = `${protocol}${targetDomain}/${targetPath}${url.search}`;
      } catch (e) {
        return new Response("Invalid cookie domain", { status: 400 });
      }
    } else {
      try {
        const protocol = isWebSocket ? 'wss://' : 'https://';
        const parsedTarget = new URL(`${protocol}${targetPath}`);
        targetDomain = parsedTarget.hostname;
        proxyUrl = `${protocol}${targetPath}${url.search}`;
        setCookie = true;
      } catch (e) {
        return new Response("Invalid target domain", { status: 400 });
      }
    }

    // Proxy request
    try {
      const headers = new Headers();
      ['Authorization', 'Cookie', 'X-Api-Key'].forEach(header => {
        const value = request.headers.get(header);
        if (value) headers.set(header, value);
      });

      const userAgent = request.headers.get('User-Agent') ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
      const accept = request.headers.get('Accept') ?? 'text/html,application/xhtml+xml,*/*;q=0.8';
      const acceptLanguage = request.headers.get('Accept-Language') ?? 'en-US,en;q=0.9';
      const acceptEncoding = request.headers.get('Accept-Encoding') ?? 'gzip, deflate, br';

      // WebSocket-specific headers
      if (isWebSocket) {
        ['Connection', 'Upgrade', 'Sec-WebSocket-Key', 'Sec-WebSocket-Version', 'Sec-WebSocket-Protocol', 'Sec-WebSocket-Extensions'].forEach(header => {
          const value = request.headers.get(header);
          if (value) headers.set(header, value);
        });
        headers.set('User-Agent', userAgent);
        headers.set('Origin', `https://${targetDomain}`);
      } else {
        headers.set('User-Agent', userAgent);
        headers.set('Accept', accept);
        headers.set('Accept-Encoding', acceptEncoding);
        headers.set('Accept-Language', acceptLanguage);
        headers.set('Connection', 'keep-alive');
        headers.set('Origin', `https://${targetDomain}`);
        headers.set('Referer', `https://${targetDomain}/`);
        headers.set('Sec-Fetch-Dest', 'empty');
        headers.set('Sec-Fetch-Mode', 'cors');
        headers.set('Sec-Fetch-Site', 'cross-site');
      }

      headers.set('Host', new URL(proxyUrl).hostname);

      const response = await fetch(proxyUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow',
      });

      if (!response.ok && isWebSocket) {
        return new Response(`WebSocket proxy failed: ${response.status} ${response.statusText}`, { status: 502 });
      }

      const modifiedResponse = new Response(response.body, response);
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() === 'set-cookie') {
          modifiedResponse.headers.append('Set-Cookie', value);
        }
      });

      if (setCookie && targetDomain) {
        modifiedResponse.headers.append('Set-Cookie', `proxied_domain=${targetDomain}; Path=/; SameSite=Strict; HttpOnly`);
      }

      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Expose-Headers', 'Set-Cookie');

      return modifiedResponse;
    } catch (error: any) {
      return new Response(`Proxy error: ${error.message}`, { status: 500 });
    }
  },
};
