import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { enviarNotificacion } from '@/lib/notificaciones';
import { useTheme, Tema } from '@/hooks/useTheme';
import ModalReporte from '@/components/ModalReporte';

export default function SolicitudScreen() {
  const { usuario } = useAuth();
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const { receptor_id, receptor_nombre, receptor_ciudad } = useLocalSearchParams<{
    receptor_id: string;
    receptor_nombre: string;
    receptor_ciudad: string;
  }>();

  const [repetidasReceptor, setRepetidasReceptor] = useState<string[]>([]);
  const [repetidasMias, setRepetidasMias] = useState<string[]>([]);
  const [pedidas, setPedidas] = useState<Set<string>>(new Set());
  const [ofrecidas, setOfrecidas] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [modalReporte, setModalReporte] = useState(false);

  useEffect(() => {
    if (usuario && receptor_id) cargarDatos();
  }, [usuario, receptor_id]);

  async function cargarDatos() {
    setCargando(true);

    const [{ data: repReceptor }, { data: repMias }] = await Promise.all([
      supabase
        .from('laminas_usuario')
        .select('numero_lamina')
        .eq('usuario_id', receptor_id)
        .eq('estado', 'repetida'),
      supabase
        .from('laminas_usuario')
        .select('numero_lamina')
        .eq('usuario_id', usuario!.id)
        .eq('estado', 'repetida'),
    ]);

    setRepetidasReceptor((repReceptor ?? []).map(r => r.numero_lamina as string).sort());
    setRepetidasMias((repMias ?? []).map(r => r.numero_lamina as string).sort());
    setCargando(false);
  }

  function togglePedida(codigo: string) {
    setPedidas(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  function toggleOfrecida(codigo: string) {
    setOfrecidas(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  async function handleEnviar() {
    if (pedidas.size === 0) {
      Alert.alert('Faltan datos', 'Selecciona al menos una lámina que quieras pedir.');
      return;
    }
    if (ofrecidas.size === 0 && nota.trim().length === 0) {
      Alert.alert('Faltan datos', 'Escribe un mensaje con tu propuesta o selecciona láminas que ofrezcas.');
      return;
    }

    setEnviando(true);

    // Verificar que no haya una solicitud pendiente o aceptada con este receptor
    const { data: activa } = await supabase
      .from('solicitudes')
      .select('id')
      .eq('solicitante_id', usuario!.id)
      .eq('receptor_id', receptor_id)
      .in('estado', ['pendiente', 'aceptada'])
      .maybeSingle();

    if (activa) {
      setEnviando(false);
      Alert.alert(
        'Solicitud activa',
        'Ya tienes una solicitud pendiente o aceptada con este coleccionista. Revísala en tu perfil.',
      );
      return;
    }

    const { error } = await supabase.from('solicitudes').insert({
      solicitante_id: usuario!.id,
      receptor_id,
      laminas_solicitadas: [...pedidas],
      laminas_ofrecidas: [...ofrecidas],
      nota: nota.trim() || null,
      estado: 'pendiente',
    });
    setEnviando(false);

    if (error) {
      Alert.alert('Error al enviar solicitud', error.message);
    } else {
      // Notificar al receptor
      const [{ data: rfToken }, { data: miPerfil }] = await Promise.all([
        supabase.from('perfiles').select('expo_push_token').eq('usuario_id', receptor_id).maybeSingle(),
        supabase.from('perfiles').select('nombre').eq('usuario_id', usuario!.id).maybeSingle(),
      ]);
      if (rfToken?.expo_push_token) {
        await enviarNotificacion(
          rfToken.expo_push_token,
          'Nueva solicitud de intercambio',
          `${miPerfil?.nombre ?? 'Un coleccionista'} quiere intercambiar láminas contigo.`,
        );
      }

      Alert.alert(
        'Solicitud enviada',
        `Tu solicitud fue enviada a ${receptor_nombre}. Si la acepta, ambos verán el WhatsApp del otro.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botonVolver}>
          <Text style={styles.botonVolverTexto}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextos}>
          <Text style={styles.headerTitulo} numberOfLines={1}>{receptor_nombre}</Text>
          <Text style={styles.headerCiudad} numberOfLines={1}>
            {receptor_ciudad || 'Sin ciudad registrada'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setModalReporte(true)} activeOpacity={0.8} style={styles.btnReporte}>
          <Text style={styles.btnReporteIcono}>⚠</Text>
        </TouchableOpacity>
      </View>
      <ModalReporte
        visible={modalReporte}
        onCerrar={() => setModalReporte(false)}
        nombreInicial={receptor_nombre ?? ''}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContenido}
        keyboardShouldPersistTaps="handled"
      >
        {/* Aviso */}
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>
            Si acepta tu solicitud, ambos verán el WhatsApp del otro para coordinar el intercambio.
          </Text>
        </View>

        {/* Sección: qué pedir */}
        <Text style={styles.seccionTitulo}>
          ¿Qué láminas le quieres pedir?{' '}
          <Text style={styles.seccionSubtitulo}>({repetidasReceptor.length} disponibles)</Text>
        </Text>

        {repetidasReceptor.length === 0 ? (
          <Text style={styles.sinLaminas}>Este coleccionista no tiene repetidas registradas.</Text>
        ) : (
          <View style={styles.chipsWrap}>
            {repetidasReceptor.map(codigo => {
              const sel = pedidas.has(codigo);
              return (
                <TouchableOpacity
                  key={codigo}
                  style={[styles.chip, sel && styles.chipSelPedir]}
                  onPress={() => togglePedida(codigo)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipTexto, sel && styles.chipTextoSel]}>{codigo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {pedidas.size > 0 && (
          <Text style={styles.contadorSel}>
            {pedidas.size} lámina{pedidas.size > 1 ? 's' : ''} seleccionada{pedidas.size > 1 ? 's' : ''}
          </Text>
        )}

        {/* Comentario / propuesta */}
        <View style={styles.divider} />
        <Text style={styles.seccionTitulo}>
          Tu propuesta{' '}
          <Text style={styles.seccionSubtitulo}>(opcional)</Text>
        </Text>
        <TextInput
          style={styles.inputNota}
          placeholder="Ej: Te doy 3 figuras de mis repetidas por ARG10, tú eliges cuáles..."
          placeholderTextColor="#bbb"
          value={nota}
          onChangeText={setNota}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />
        {nota.length > 0 && (
          <Text style={styles.contadorSel}>{nota.length}/300 caracteres</Text>
        )}
        <View style={styles.avisoRepetidas}>
          <Text style={styles.avisoRepetidasTexto}>
            El receptor verá todas tus láminas repetidas ({repetidasMias.length}) al revisar tu propuesta.
          </Text>
        </View>

        {/* Sección: qué ofrecer — opcional */}
        <View style={styles.divider} />
        <Text style={styles.seccionTitulo}>
          Especifica láminas a ofrecer{' '}
          <Text style={styles.seccionSubtitulo}>(opcional — {repetidasMias.length} repetidas tuyas)</Text>
        </Text>
        <Text style={styles.sinLaminas}>
          Si quieres precisar cuáles das, selecciónalas. Si no, el receptor verá todas tus repetidas y acordarán en el chat.
        </Text>

        {repetidasMias.length > 0 && (
          <View style={styles.chipsWrap}>
            {repetidasMias.map(codigo => {
              const sel = ofrecidas.has(codigo);
              return (
                <TouchableOpacity
                  key={codigo}
                  style={[styles.chip, sel && styles.chipSelOfrecer]}
                  onPress={() => toggleOfrecida(codigo)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipTexto, sel && styles.chipTextoSel]}>{codigo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {ofrecidas.size > 0 && (
          <Text style={styles.contadorSel}>
            {ofrecidas.size} lámina{ofrecidas.size > 1 ? 's' : ''} seleccionada{ofrecidas.size > 1 ? 's' : ''}
          </Text>
        )}

        {/* Botón enviar */}
        <TouchableOpacity
          style={[styles.botonEnviar, enviando && styles.botonDeshabilitado]}
          onPress={handleEnviar}
          disabled={enviando}
          activeOpacity={0.85}
        >
          {enviando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botonEnviarTexto}>Enviar solicitud</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          MiCromo es solo un tablón de encuentro. Los intercambios ocurren directamente entre las partes y son de su exclusiva responsabilidad.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: t.fondo,
  },
  contenedor: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  header: {
    backgroundColor: '#e63946',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botonVolver: {
    paddingRight: 4,
    paddingVertical: 2,
  },
  btnReporte: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  btnReporteIcono: {
    fontSize: 15,
    color: '#fff',
  },
  botonVolverTexto: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
  },
  headerTextos: {
    flex: 1,
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerCiudad: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContenido: {
    padding: 16,
    paddingBottom: 40,
  },
  aviso: {
    backgroundColor: t.fondoNaranja,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#f4a261',
  },
  avisoTexto: {
    fontSize: 13,
    color: t.oscuro ? '#d4a96a' : '#7c5a2e',
    lineHeight: 18,
  },
  seccionTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: t.texto,
    marginBottom: 12,
  },
  seccionSubtitulo: {
    fontSize: 13,
    fontWeight: '400',
    color: t.textoTer,
  },
  sinLaminas: {
    fontSize: 13,
    color: t.textoDes,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: t.alt,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelPedir: {
    backgroundColor: '#e8f7f5',
    borderColor: '#2a9d8f',
  },
  chipSelOfrecer: {
    backgroundColor: '#fef0f1',
    borderColor: '#e63946',
  },
  chipTexto: {
    fontSize: 13,
    color: t.textoSec,
    fontWeight: '600',
  },
  chipTextoSel: {
    color: t.texto,
    fontWeight: '700',
  },
  contadorSel: {
    fontSize: 12,
    color: t.textoTer,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: t.borde,
    marginVertical: 20,
  },
  avisoRepetidas: {
    backgroundColor: t.fondoVerde,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2a9d8f',
  },
  avisoRepetidasTexto: {
    fontSize: 12,
    color: t.oscuro ? '#4db8ad' : '#2a6e65',
    lineHeight: 17,
  },
  inputNota: {
    borderWidth: 1,
    borderColor: t.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: t.texto,
    minHeight: 80,
    backgroundColor: t.input,
    marginBottom: 6,
  },
  botonEnviar: {
    backgroundColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  botonEnviarTexto: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: t.textoDes,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  });
}
