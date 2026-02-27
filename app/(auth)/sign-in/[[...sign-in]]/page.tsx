import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        variables: {
          colorBackground: "#0f172a",
          colorText: "#f1f5f9",
          colorPrimary: "#3b82f6",
          colorInputBackground: "#1e293b",
          colorInputText: "#f1f5f9",
        },
        elements: {
          card: "shadow-2xl border border-slate-700",
          headerTitle: "text-slate-100",
          headerSubtitle: "text-slate-400",
          socialButtonsBlockButton: "border-slate-600 text-slate-200 hover:bg-slate-700",
          formFieldLabel: "text-slate-300",
          footerActionLink: "text-blue-400 hover:text-blue-300",
        },
      }}
    />
  );
}
