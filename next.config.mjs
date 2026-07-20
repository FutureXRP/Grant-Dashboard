/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      // Codespaces serves the app through a *.app.github.dev forwarded URL —
      // without this, Next's origin check can reject form submissions with
      // "Invalid Server Actions request".
      allowedOrigins: ["*.app.github.dev", "localhost:3000"],
      // Room for large pasted NOFO texts (default is 1 MB).
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
