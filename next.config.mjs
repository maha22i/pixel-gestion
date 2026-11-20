/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "pg", "bcryptjs", "nodemailer", "exceljs", "qrcode"],
    serverActions: { bodySizeLimit: "20mb" },
  },
};
export default nextConfig;
