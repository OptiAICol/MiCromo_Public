import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, Tema } from '@/hooks/useTheme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Completa todos los campos.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.titulo}>MiCromo</Text>
        <Text style={styles.subtitulo}>Inicia sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.boton, loading && styles.botonDeshabilitado]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botonTexto}>Iniciar sesión</Text>}
        </Pressable>

        <Link href="/(auth)/registro" style={styles.link}>
          ¿No tienes cuenta? Regístrate aquí
        </Link>

        <Link href="/(auth)/recuperar" style={[styles.link, styles.linkRecuperar]}>
          ¿Olvidaste tu contraseña?
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.fondo,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: t.tarjeta,
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  titulo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e63946',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitulo: {
    fontSize: 16,
    color: t.textoTer,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: t.texto,
    marginBottom: 14,
    backgroundColor: t.input,
  },
  error: {
    color: '#e63946',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  boton: {
    backgroundColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  botonTexto: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#e63946',
    fontSize: 14,
    textAlign: 'center',
  },
  linkRecuperar: {
    color: t.textoDes,
    marginTop: 10,
  },
  });
}
