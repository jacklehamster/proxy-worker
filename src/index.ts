export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    let path = url.pathname.slice(1);
    if (!path) return new Response("No target URL", { status: 400 });

    // Remove 'https://' or 'http://' from path
    path = path.replace(/^https?:\/\//, '');
    const targetUrl = `https://${path}${url.search}`;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
        status: 204,
      });
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "follow",
      });

      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Expose-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (e) {
      return new Response(`Proxy error: ${e}`, { status: 500 });
    }
  },
};
