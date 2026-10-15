// src/middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

// Cấu hình matcher để Next.js biết file nào cần chạy qua lớp bảo vệ này
export const config = {
  matcher: [
    /*
     * Match tất cả các request path ngoại trừ:
     * - _next/static (chứa file tĩnh)
     * - _next/image (chứa file ảnh tối ưu)
     * - favicon.ico (icon website)
     * - các file ảnh, svg, css...
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}