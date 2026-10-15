// FLASHCARD/src/(dashboard)/layout.tsx
import DashboardLayout from '../../components/layout/DashboardLayout';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // GIẢ LẬP: Lấy dữ liệu user từ Server (Thay bằng logic Supabase/NextAuth thực tế)
  // const supabase = createClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();

  const mockUser = {
    name: "Nguyễn Văn A",
    email: "nguyenvana@example.com",
    role: "STUDENT"
  };

  return (
    <DashboardLayout user={mockUser}>
      {children}
    </DashboardLayout>
  );
}
