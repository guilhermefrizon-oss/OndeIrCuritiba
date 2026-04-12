import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

type AuthContextType = {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string, name: string) {
    try {
      const { user } = await auth().createUserWithEmailAndPassword(email, password);
      await user.updateProfile({ displayName: name });
      return { error: null };
    } catch (e: any) {
      return { error: translateError(e.code) };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      await auth().signInWithEmailAndPassword(email, password);
      return { error: null };
    } catch (e: any) {
      return { error: translateError(e.code) };
    }
  }

  async function signOut() {
    await auth().signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function translateError(code: string): string {
  const map: Record<string, string> = {
    'auth/email-already-in-use':   'Este e-mail já está cadastrado.',
    'auth/invalid-email':          'E-mail inválido.',
    'auth/weak-password':          'Senha muito fraca (mínimo 6 caracteres).',
    'auth/user-not-found':         'Usuário não encontrado.',
    'auth/wrong-password':         'Senha incorreta.',
    'auth/too-many-requests':      'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
  };
  return map[code] ?? 'Algo deu errado. Tente novamente.';
}
