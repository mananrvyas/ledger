"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type SignupState = { error: string | null; message: string | null };

export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required.", message: null };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", message: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message, message: null };
  }

  // If email confirmation is enabled in Supabase, no session yet — show a message.
  if (!data.session) {
    return {
      error: null,
      message:
        "Account created. Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect("/");
}
