import type { NextConfig } from "next";

// Serviço somente de API: o front-end estático da EducaMente AI continua fora do Next.js.
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
