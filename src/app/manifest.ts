import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rowhou8e OPS',
    short_name: 'Rowhou8e',
    description: 'ระบบควบคุมงานประจำวันทุกแผนก สำหรับร้านโรว์เฮ้าส์',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#424242',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
