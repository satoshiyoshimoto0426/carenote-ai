import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerkAppearance";

/** ログイン画面。見た目は lib/clerkAppearance.ts に集約（新規登録と必ず同じにするため）。 */
export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />;
}
