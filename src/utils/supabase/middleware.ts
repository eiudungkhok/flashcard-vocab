// src/utils/supabase/middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          supabaseResponse = NextResponse.next({ request: { headers: request.headers } })
          supabaseResponse.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          supabaseResponse = NextResponse.next({ request: { headers: request.headers } })
          supabaseResponse.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isStudentRoute = request.nextUrl.pathname.startsWith('/student')
  const isTeacherRoute = request.nextUrl.pathname.startsWith('/teacher')

  // 1. Chưa đăng nhập mà đòi vào các trang bảo vệ
  if (!user && (isStudentRoute || isTeacherRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Đã đăng nhập
  if (user) {
    // Lấy quyền từ metadata, mặc định là student nếu dữ liệu cũ chưa có role
    const userRole = user.user_metadata?.role || 'student'

    // 2a. Đang ở trang Login/Register -> Điều hướng thẳng vào Dashboard của đúng role
    if (isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = userRole === 'teacher' ? '/teacher' : '/student'
      return NextResponse.redirect(url)
    }

    // 2b. Học viên đi lạc vào trang Giảng viên -> Đuổi về trang Học viên
    if (userRole === 'student' && isTeacherRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/student'
      return NextResponse.redirect(url)
    }

    // 2c. Giảng viên đi lạc vào trang Học viên -> Đuổi về trang Giảng viên
    if (userRole === 'teacher' && isStudentRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/teacher'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}