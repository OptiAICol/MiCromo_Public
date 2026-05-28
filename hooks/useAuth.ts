import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface ResultadoAuth {
  error: string | null;
}

interface ResultadoRegistro extends ResultadoAuth {
  confirmarCorreo: boolean;
  userId: string | null;
}

interface UseAuthReturn {
  usuario: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ResultadoAuth>;
  signUp: (email: string, password: string, nombre: string) => Promise<ResultadoRegistro>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<ResultadoAuth> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    nombre: string,
  ): Promise<ResultadoRegistro> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message, confirmarCorreo: false, userId: null };

    // Si hay sesión inmediata (confirmación de email desactivada), actualiza el nombre
    if (data.session && data.user) {
      await supabase.from('perfiles').update({ nombre }).eq('usuario_id', data.user.id);
    }

    return { error: null, confirmarCorreo: !data.session, userId: data.user?.id ?? null };
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  return {
    usuario: session?.user ?? null,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };
}
