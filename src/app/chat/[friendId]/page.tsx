import { redirect } from "next/navigation";

// Legacy DM route — Messages is now a master-detail view at /chat.
export default async function DmRedirect({ params }: { params: Promise<{ friendId: string }> }) {
  const { friendId } = await params;
  redirect(`/chat?dm=${encodeURIComponent(friendId)}`);
}
