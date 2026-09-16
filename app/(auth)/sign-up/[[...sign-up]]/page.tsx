import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerkAppearance";

/** 新規登録画面。見た目は lib/clerkAppearance.ts に集約（ログインと必ず同じにするため）。 */
export default function SignUpPage() {
  return <SignUp appearance={clerkAppearance} />;
}
