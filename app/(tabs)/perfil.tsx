import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNotificaciones } from './_layout';
import { SECCIONES_ALBUM } from '@/constants/laminas';
import { enviarNotificacion } from '@/lib/notificaciones';
import { useTheme, Tema } from '@/hooks/useTheme';
import ModalReporte from '@/components/ModalReporte';

const TODOS_CODIGOS = SECCIONES_ALBUM.flatMap(s => s.laminas);

interface Perfil {
  usuario_id: string;
  nombre: string | null;
  ciudad: string | null;
  whatsapp: string | null;
}

interface Solicitud {
  id: string;
  solicitante_id: string;
  receptor_id: string;
  laminas_solicitadas: string[];
  laminas_ofrecidas: string[];
  nota: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  completado_solicitante: boolean;
  completado_receptor: boolean;
  created_at: string;
  otro_nombre: string;
  otro_whatsapp: string | null;
}

interface ContactoAnuncio {
  id:                  string;
  anuncio_id:          string;
  comprador_id:        string;
  vendedor_id:         string;
  mensaje:             string | null;
  estado:              'pendiente' | 'aceptada' | 'rechazada';
  created_at:          string;
  comprador_nombre:    string;
  comprador_whatsapp:  string | null;
  comprador_token:     string | null;
  anuncio_laminas:     string[];
  anuncio_precio:      number;
}

interface ContactoEnviado {
  id:              string;
  anuncio_id:      string;
  vendedor_id:     string;
  mensaje:         string | null;
  estado:          'pendiente' | 'aceptada' | 'rechazada';
  vendedor_nombre: string;
  vendedor_wa:     string | null;
  anuncio_laminas: string[];
  anuncio_precio:  number;
}

function formatCOP(valor: number): string {
  return '$' + Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function PerfilScreen() {
  const { usuario, signOut } = useAuth();
  const router = useRouter();
  const { recargar: recargarBadge } = useNotificaciones();
  const { t, toggleTema } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const [modalReporte, setModalReporte] = useState(false);

  const [perfil, setPerfil]               = useState<Perfil | null>(null);
  const [recibidas, setRecibidas]         = useState<Solicitud[]>([]);
  const [enviadas, setEnviadas]           = useState<Solicitud[]>([]);
  const [misFaltantes, setMisFaltantes]   = useState<Set<string>>(new Set());
  const [misRepetidas, setMisRepetidas]   = useState<Set<string>>(new Set());
  const [miPuntuacion, setMiPuntuacion]           = useState<number | null>(null);
  const [miTotalVotos, setMiTotalVotos]           = useState(0);
  const [contactosPendientes, setContactosPendientes] = useState<ContactoAnuncio[]>([]);
  const [contactosEnviados, setContactosEnviados]     = useState<ContactoEnviado[]>([]);
  const [cargando, setCargando]                   = useState(true);

  const isFocusadoRef   = useRef(false);
  const cargarTodoRef   = useRef(cargarTodo);
  cargarTodoRef.current = cargarTodo;

  useFocusEffect(
    useCallback(() => {
      isFocusadoRef.current = true;
      if (usuario) cargarTodo();
      return () => { isFocusadoRef.current = false; };
    }, [usuario]),
  );

  // Suscripción Realtime: recarga perfil cuando cambian solicitudes o contactos
  useEffect(() => {
    if (!usuario) return;
    const uid = usuario.id;

    const handler = () => { if (isFocusadoRef.current) cargarTodoRef.current(true); };

    const canal = supabase
      .channel(`perfil-rt-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes',       filter: `receptor_id=eq.${uid}`    }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes',       filter: `solicitante_id=eq.${uid}` }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos_anuncio', filter: `vendedor_id=eq.${uid}`    }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos_anuncio', filter: `comprador_id=eq.${uid}`   }, handler)
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [usuario]);

  async function cargarTodo(silencioso = false) {
    if (!silencioso) setCargando(true);
    await Promise.all([cargarPerfil(), cargarSolicitudes(), cargarContactosPendientes(), cargarContactosEnviados()]);
    setCargando(false);
    recargarBadge();
  }

  async function cargarPerfil() {
    const [{ data: perfilData }, { data: ratingData }] = await Promise.all([
      supabase
        .from('perfiles')
        .select('usuario_id, nombre, ciudad, whatsapp')
        .eq('usuario_id', usuario!.id)
        .single(),
      supabase
        .from('valoraciones')
        .select('puntos')
        .eq('evaluado_id', usuario!.id),
    ]);

    if (perfilData) setPerfil(perfilData as Perfil);

    const puntos = (ratingData ?? []).map(r => r.puntos as number);
    if (puntos.length > 0) {
      setMiPuntuacion(puntos.reduce((a, b) => a + b, 0) / puntos.length);
      setMiTotalVotos(puntos.length);
    } else {
      setMiPuntuacion(null);
      setMiTotalVotos(0);
    }
  }

  async function cargarSolicitudes() {
    const [
      { data: recibidasRaw, error: errRecibidas },
      { data: enviadasRaw, error: errEnviadas },
      { data: misLaminasData },
    ] = await Promise.all([
      supabase
        .from('solicitudes')
        .select('id, solicitante_id, receptor_id, laminas_solicitadas, laminas_ofrecidas, nota, estado, completado_solicitante, completado_receptor, created_at')
        .eq('receptor_id', usuario!.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('solicitudes')
        .select('id, solicitante_id, receptor_id, laminas_solicitadas, laminas_ofrecidas, nota, estado, completado_solicitante, completado_receptor, created_at')
        .eq('solicitante_id', usuario!.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('laminas_usuario')
        .select('numero_lamina, estado')
        .eq('usuario_id', usuario!.id),
    ]);

    if (errRecibidas) console.error('Error solicitudes recibidas:', errRecibidas.message);
    if (errEnviadas)  console.error('Error solicitudes enviadas:',  errEnviadas.message);

    const mis     = misLaminasData ?? [];
    const tieneSet = new Set(mis.filter(r => r.estado === 'tenida' || r.estado === 'repetida').map(r => r.numero_lamina as string));
    setMisFaltantes(new Set(TODOS_CODIGOS.filter(c => !tieneSet.has(c))));
    setMisRepetidas(new Set(mis.filter(r => r.estado === 'repetida').map(r => r.numero_lamina as string)));

    const uidsOtros = new Set<string>();
    for (const s of recibidasRaw ?? []) uidsOtros.add(s.solicitante_id);
    for (const s of enviadasRaw   ?? []) uidsOtros.add(s.receptor_id);

    let perfilesMap: Record<string, { nombre: string; whatsapp: string | null }> = {};
    if (uidsOtros.size > 0) {
      const { data: perfilesData } = await supabase
        .from('perfiles')
        .select('usuario_id, nombre, whatsapp')
        .in('usuario_id', [...uidsOtros]);
      for (const p of perfilesData ?? []) {
        perfilesMap[p.usuario_id] = { nombre: p.nombre ?? 'Coleccionista', whatsapp: p.whatsapp ?? null };
      }
    }

    const enriquecer = (
      raw: typeof recibidasRaw,
      otroIdKey: 'solicitante_id' | 'receptor_id',
    ): Solicitud[] =>
      (raw ?? []).map(s => ({
        ...s,
        estado:                  s.estado as Solicitud['estado'],
        nota:                    (s as Record<string, unknown>).nota as string | null ?? null,
        completado_solicitante:  !!s.completado_solicitante,
        completado_receptor:     !!s.completado_receptor,
        otro_nombre:             perfilesMap[s[otroIdKey]]?.nombre   ?? 'Coleccionista',
        otro_whatsapp:           perfilesMap[s[otroIdKey]]?.whatsapp ?? null,
      }));

    const recibidasEnriquecidas = enriquecer(recibidasRaw, 'solicitante_id');
    recibidasEnriquecidas.sort((a, b) => {
      if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
      if (a.estado !== 'pendiente' && b.estado === 'pendiente') return 1;
      return 0;
    });

    // Ocultar de la vista del usuario que ya confirmó su parte
    setRecibidas(recibidasEnriquecidas.filter(s => !s.completado_receptor));
    setEnviadas(enriquecer(enviadasRaw, 'receptor_id').filter(s => !s.completado_solicitante));
  }

  async function cargarContactosPendientes() {
    const { data: cData } = await supabase
      .from('contactos_anuncio')
      .select('id, anuncio_id, comprador_id, vendedor_id, mensaje, estado, created_at')
      .eq('vendedor_id', usuario!.id)
      .in('estado', ['pendiente', 'aceptada'])
      .order('created_at', { ascending: false });

    if (!cData || cData.length === 0) {
      setContactosPendientes([]);
      return;
    }

    const compradorIds = [...new Set(cData.map(c => c.comprador_id as string))];
    const anuncioIds   = [...new Set(cData.map(c => c.anuncio_id as string))];

    const [{ data: perfilesData }, { data: anunciosData }] = await Promise.all([
      supabase.from('perfiles').select('usuario_id, nombre, whatsapp, expo_push_token').in('usuario_id', compradorIds),
      supabase.from('anuncios').select('id, laminas, precio').in('id', anuncioIds),
    ]);

    const pMap: Record<string, { nombre: string; whatsapp: string | null; token: string | null }> = {};
    for (const p of perfilesData ?? []) {
      pMap[p.usuario_id] = {
        nombre:   p.nombre ?? 'Coleccionista',
        whatsapp: p.whatsapp ?? null,
        token:    p.expo_push_token ?? null,
      };
    }
    const aMap: Record<string, { laminas: string[]; precio: number }> = {};
    for (const a of anunciosData ?? []) {
      aMap[a.id] = { laminas: a.laminas as string[], precio: a.precio as number };
    }

    setContactosPendientes(cData.map(c => ({
      ...c,
      estado:             c.estado as ContactoAnuncio['estado'],
      mensaje:            c.mensaje as string | null ?? null,
      comprador_nombre:   pMap[c.comprador_id]?.nombre   ?? 'Coleccionista',
      comprador_whatsapp: pMap[c.comprador_id]?.whatsapp ?? null,
      comprador_token:    pMap[c.comprador_id]?.token    ?? null,
      anuncio_laminas:    aMap[c.anuncio_id]?.laminas    ?? [],
      anuncio_precio:     aMap[c.anuncio_id]?.precio     ?? 0,
    })));
  }

  async function handleAceptarContacto(contacto: ContactoAnuncio) {
    const { data: actualizado, error } = await supabase
      .from('contactos_anuncio')
      .update({ estado: 'aceptada' })
      .eq('id', contacto.id)
      .select('id');
    if (error || !actualizado || actualizado.length === 0) {
      Alert.alert('Error', 'No se pudo aceptar la solicitud.');
      return;
    }
    setContactosPendientes(prev => prev.map(c =>
      c.id === contacto.id ? { ...c, estado: 'aceptada' as const } : c,
    ));
    recargarBadge();

    if (contacto.comprador_token) {
      await enviarNotificacion(
        contacto.comprador_token,
        'Solicitud de contacto aceptada',
        'El vendedor aceptó tu solicitud. Abre MiCromo para ver su WhatsApp y concretar la compra.',
      );
    }
  }

  async function cargarContactosEnviados() {
    const { data: cData } = await supabase
      .from('contactos_anuncio')
      .select('id, anuncio_id, vendedor_id, mensaje, estado')
      .eq('comprador_id', usuario!.id)
      .order('created_at', { ascending: false });

    if (!cData || cData.length === 0) { setContactosEnviados([]); return; }

    const vendedorIds = [...new Set(cData.map(c => c.vendedor_id as string))];
    const anuncioIds  = [...new Set(cData.map(c => c.anuncio_id  as string))];

    const [{ data: perfilesData }, { data: anunciosData }] = await Promise.all([
      supabase.from('perfiles').select('usuario_id, nombre, whatsapp').in('usuario_id', vendedorIds),
      supabase.from('anuncios').select('id, laminas, precio').in('id', anuncioIds),
    ]);

    const pMap: Record<string, { nombre: string; whatsapp: string | null }> = {};
    for (const p of perfilesData ?? []) {
      pMap[p.usuario_id] = { nombre: p.nombre ?? 'Vendedor', whatsapp: p.whatsapp ?? null };
    }
    const aMap: Record<string, { laminas: string[]; precio: number }> = {};
    for (const a of anunciosData ?? []) {
      aMap[a.id] = { laminas: a.laminas as string[], precio: a.precio as number };
    }

    setContactosEnviados(cData.map(c => ({
      ...c,
      estado:          c.estado as ContactoEnviado['estado'],
      mensaje:         c.mensaje as string | null ?? null,
      vendedor_nombre: pMap[c.vendedor_id]?.nombre   ?? 'Vendedor',
      vendedor_wa:     c.estado === 'aceptada' ? (pMap[c.vendedor_id]?.whatsapp ?? null) : null,
      anuncio_laminas: aMap[c.anuncio_id]?.laminas   ?? [],
      anuncio_precio:  aMap[c.anuncio_id]?.precio    ?? 0,
    })));
  }

  async function handleEliminarContacto(id: string) {
    Alert.alert(
      'Eliminar solicitud de contacto',
      '¿Seguro? Desaparecerá del perfil de ambas partes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('contactos_anuncio').delete().eq('id', id);
            if (error) { Alert.alert('Error', 'No se pudo eliminar.'); return; }
            setContactosPendientes(prev => prev.filter(c => c.id !== id));
            setContactosEnviados(prev => prev.filter(c => c.id !== id));
          },
        },
      ],
    );
  }

  async function handleEliminarSolicitud(id: string) {
    Alert.alert(
      'Eliminar solicitud',
      '¿Seguro que quieres eliminarla? El otro coleccionista ya no podrá verla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('solicitudes').delete().eq('id', id);
            if (error) { Alert.alert('Error', 'No se pudo eliminar la solicitud.'); return; }
            setEnviadas(prev => prev.filter(s => s.id !== id));
          },
        },
      ],
    );
  }

  async function handleRechazarContacto(contacto: ContactoAnuncio) {
    const { data: actualizado, error } = await supabase
      .from('contactos_anuncio')
      .update({ estado: 'rechazada' })
      .eq('id', contacto.id)
      .select('id');
    if (error || !actualizado || actualizado.length === 0) {
      Alert.alert('Error', 'No se pudo rechazar la solicitud.');
      return;
    }
    setContactosPendientes(prev => prev.filter(c => c.id !== contacto.id));
    recargarBadge();

    if (contacto.comprador_token) {
      await enviarNotificacion(
        contacto.comprador_token,
        'Solicitud de contacto no aceptada',
        'El vendedor no pudo aceptar tu solicitud en este momento.',
      );
    }
  }

  async function handleAceptar(solicitud: Solicitud) {
    const { data: actualizado, error } = await supabase
      .from('solicitudes')
      .update({ estado: 'aceptada' })
      .eq('id', solicitud.id)
      .select('id');
    if (error || !actualizado || actualizado.length === 0) {
      Alert.alert('Error', 'No se pudo aceptar la solicitud.');
      return;
    }
    setRecibidas(prev => prev.map(s => (s.id === solicitud.id ? { ...s, estado: 'aceptada' } : s)));
    recargarBadge();

    // Notificar al solicitante
    const { data: pf } = await supabase
      .from('perfiles')
      .select('expo_push_token')
      .eq('usuario_id', solicitud.solicitante_id)
      .maybeSingle();
    if (pf?.expo_push_token) {
      await enviarNotificacion(
        pf.expo_push_token,
        '¡Solicitud aceptada! 🎉',
        `${perfil?.nombre ?? 'Tu contacto'} aceptó tu solicitud de intercambio.`,
      );
    }

    if (solicitud.otro_whatsapp) {
      Alert.alert(
        'Solicitud aceptada',
        `WhatsApp de ${solicitud.otro_nombre}: ${solicitud.otro_whatsapp}\n\nTu WhatsApp fue revelado también.`,
        [
          {
            text: 'Abrir WhatsApp',
            onPress: () => Linking.openURL(`https://wa.me/${solicitud.otro_whatsapp}`).catch(() => {}),
          },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } else {
      Alert.alert(
        'Solicitud aceptada',
        `${solicitud.otro_nombre} no tiene WhatsApp registrado. Pídele que actualice su perfil.`,
      );
    }
  }

  async function handleRechazar(solicitud: Solicitud) {
    Alert.alert('Rechazar solicitud', '¿Seguro que quieres rechazar esta solicitud?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          const { data: actualizado, error } = await supabase
            .from('solicitudes')
            .update({ estado: 'rechazada' })
            .eq('id', solicitud.id)
            .select('id');
          if (error || !actualizado || actualizado.length === 0) { Alert.alert('Error', 'No se pudo rechazar la solicitud.'); return; }
          setRecibidas(prev => prev.map(s => (s.id === solicitud.id ? { ...s, estado: 'rechazada' } : s)));
          recargarBadge();

          // Notificar al solicitante
          const { data: pf } = await supabase
            .from('perfiles')
            .select('expo_push_token')
            .eq('usuario_id', solicitud.solicitante_id)
            .maybeSingle();
          if (pf?.expo_push_token) {
            await enviarNotificacion(
              pf.expo_push_token,
              'Solicitud no aceptada',
              `${perfil?.nombre ?? 'Tu contacto'} no pudo aceptar tu solicitud en este momento.`,
            );
          }
        },
      },
    ]);
  }

  function handleCompletado(id: string, campo: 'completado_solicitante' | 'completado_receptor') {
    // Ocultar inmediatamente de la vista del usuario que confirmó
    if (campo === 'completado_receptor') {
      setRecibidas(prev => prev.filter(s => s.id !== id));
    } else {
      setEnviadas(prev => prev.filter(s => s.id !== id));
    }
  }

  async function handleCerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => { await signOut(); } },
    ]);
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Mi Perfil</Text>
        <TouchableOpacity onPress={() => setModalReporte(true)} activeOpacity={0.8} style={styles.btnReporte}>
          <Text style={styles.btnReporteIcono}>⚠</Text>
        </TouchableOpacity>
      </View>

      {/* Datos */}
      <View style={styles.tarjeta}>
        <FilaDato etiqueta="Nombre"   valor={perfil?.nombre   ?? '—'} />
        <FilaDato etiqueta="Ciudad"   valor={perfil?.ciudad   ?? '—'} />
        <FilaDato etiqueta="WhatsApp" valor={perfil?.whatsapp ?? '—'} />
        <FilaDato etiqueta="Correo"   valor={usuario?.email   ?? '—'} />
        {miPuntuacion !== null && (
          <FilaDato
            etiqueta="Valoración"
            valor={`★ ${miPuntuacion.toFixed(1)} de 5 · ${miTotalVotos} reseña${miTotalVotos !== 1 ? 's' : ''}`}
          />
        )}
        {/* Toggle modo oscuro */}
        <View style={styles.filaToggle}>
          <Text style={styles.filaToggleLabel}>Modo oscuro</Text>
          <TouchableOpacity onPress={toggleTema} activeOpacity={0.8} style={styles.toggleBoton}>
            <View style={styles.toggleTrack}>
              <View style={[styles.toggleThumb, t.oscuro && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ModalReporte visible={modalReporte} onCerrar={() => setModalReporte(false)} />

      <TouchableOpacity style={styles.botonEditar} onPress={() => router.push('/(tabs)/editar-perfil')}>
        <Text style={styles.botonEditarTexto}>Editar perfil</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.botonHistorial} onPress={() => router.push('/historial')}>
        <Text style={styles.botonHistorialTexto}>Ver historial de intercambios</Text>
      </TouchableOpacity>

      {/* Solicitudes de contacto en mis anuncios */}
      {contactosPendientes.length > 0 && (
        <>
          <Text style={styles.seccionTitulo}>
            Solicitudes de contacto
            {contactosPendientes.filter(c => c.estado === 'pendiente').length > 0 && (
              <Text style={styles.badgeConteo}>
                {' '}{contactosPendientes.filter(c => c.estado === 'pendiente').length}
              </Text>
            )}
          </Text>
          {contactosPendientes.map(c => (
            <View key={c.id} style={[styles.tarjetaContacto, c.estado === 'aceptada' && styles.tarjetaContactoAceptada]}>
              <View style={styles.contactoHeader}>
                <Text style={styles.contactoNombre}>{c.comprador_nombre}</Text>
                <View style={[styles.estadoBadge, { backgroundColor: c.estado === 'pendiente' ? '#fff3cd' : '#d4edda' }]}>
                  <Text style={[styles.estadoTexto, { color: c.estado === 'pendiente' ? '#856404' : '#155724' }]}>
                    {c.estado === 'pendiente' ? 'Pendiente' : '✓ Aceptada'}
                  </Text>
                </View>
              </View>
              <View style={styles.chipsWrap}>
                {c.anuncio_laminas.map(cod => (
                  <View key={cod} style={styles.chip}>
                    <Text style={styles.chipTexto}>{cod}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.contactoPrecio}>{formatCOP(c.anuncio_precio)}</Text>
              {!!c.mensaje && (
                <View style={styles.notaBox}>
                  <Text style={styles.notaTexto}>"{c.mensaje}"</Text>
                </View>
              )}
              {c.estado === 'aceptada' && c.comprador_whatsapp ? (
                <TouchableOpacity
                  style={styles.botonWA}
                  onPress={() => Linking.openURL(`https://wa.me/${c.comprador_whatsapp}`).catch(() => {})}
                  activeOpacity={0.8}
                >
                  <Text style={styles.botonWATexto}>Hablar por WhatsApp</Text>
                </TouchableOpacity>
              ) : c.estado === 'aceptada' ? (
                <Text style={styles.sinDetalle}>El comprador no tiene WhatsApp registrado.</Text>
              ) : (
                <View style={styles.botonesContacto}>
                  <TouchableOpacity
                    style={styles.btnAceptarContacto}
                    onPress={() => handleAceptarContacto(c)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnAceptarContactoTexto}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnRechazarContacto}
                    onPress={() => handleRechazarContacto(c)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnRechazarContactoTexto}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                onPress={() => handleEliminarContacto(c.id)}
                activeOpacity={0.7}
                style={styles.btnEliminarSolicitud}
              >
                <Text style={styles.btnEliminarSolicitudTexto}>Eliminar solicitud</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* Solicitudes recibidas */}
      <Text style={styles.seccionTitulo}>Solicitudes recibidas</Text>
      {recibidas.length === 0 ? (
        <Text style={styles.sinSolicitudes}>Aún no has recibido solicitudes de intercambio.</Text>
      ) : (
        recibidas.map(s => (
          <TarjetaSolicitud
            key={s.id}
            solicitud={s}
            esRecibida
            misFaltantes={misFaltantes}
            misRepetidas={misRepetidas}
            usuarioId={usuario!.id}
            onAceptar={() => handleAceptar(s)}
            onRechazar={() => handleRechazar(s)}
            onCompletado={handleCompletado}
          />
        ))
      )}

      {/* Solicitudes enviadas */}
      <Text style={styles.seccionTitulo}>Solicitudes enviadas</Text>
      {enviadas.length === 0 ? (
        <Text style={styles.sinSolicitudes}>Aún no has enviado solicitudes de intercambio.</Text>
      ) : (
        enviadas.map(s => (
          <TarjetaSolicitud
            key={s.id}
            solicitud={s}
            esRecibida={false}
            misFaltantes={misFaltantes}
            misRepetidas={misRepetidas}
            usuarioId={usuario!.id}
            onCompletado={handleCompletado}
            onEliminar={() => handleEliminarSolicitud(s.id)}
          />
        ))
      )}

      {/* Contactos enviados (como comprador) */}
      {contactosEnviados.length > 0 && (
        <>
          <Text style={styles.seccionTitulo}>Contactos enviados</Text>
          {contactosEnviados.map(c => {
            const colBadge = c.estado === 'aceptada' ? '#d4edda'
              : c.estado === 'rechazada' ? '#f8d7da' : '#fff3cd';
            const colTexto = c.estado === 'aceptada' ? '#155724'
              : c.estado === 'rechazada' ? '#721c24' : '#856404';
            const labelBadge = c.estado === 'aceptada' ? '✓ Aceptada'
              : c.estado === 'rechazada' ? 'Rechazada' : 'Pendiente';
            return (
              <View key={c.id} style={[styles.tarjetaContacto, c.estado === 'aceptada' && styles.tarjetaContactoAceptada]}>
                <View style={styles.contactoHeader}>
                  <Text style={styles.contactoNombre}>{c.vendedor_nombre}</Text>
                  <View style={[styles.estadoBadge, { backgroundColor: colBadge }]}>
                    <Text style={[styles.estadoTexto, { color: colTexto }]}>{labelBadge}</Text>
                  </View>
                </View>
                <View style={styles.chipsWrap}>
                  {c.anuncio_laminas.map(cod => (
                    <View key={cod} style={styles.chip}>
                      <Text style={styles.chipTexto}>{cod}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.contactoPrecio}>{formatCOP(c.anuncio_precio)}</Text>
                {!!c.mensaje && (
                  <View style={styles.notaBox}>
                    <Text style={styles.notaTexto}>"{c.mensaje}"</Text>
                  </View>
                )}
                {c.estado === 'aceptada' && c.vendedor_wa ? (
                  <TouchableOpacity
                    style={styles.botonWA}
                    onPress={() => Linking.openURL(`https://wa.me/${c.vendedor_wa}`).catch(() => {})}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.botonWATexto}>Contactar por WhatsApp</Text>
                  </TouchableOpacity>
                ) : c.estado === 'aceptada' ? (
                  <Text style={styles.sinDetalle}>El vendedor no tiene WhatsApp registrado.</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => handleEliminarContacto(c.id)}
                  activeOpacity={0.7}
                  style={styles.btnEliminarSolicitud}
                >
                  <Text style={styles.btnEliminarSolicitudTexto}>Eliminar solicitud</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}

      <TouchableOpacity
        style={styles.linkPrivacidad}
        onPress={() => router.push('/privacidad')}
        activeOpacity={0.7}
      >
        <Text style={styles.linkPrivacidadTexto}>Política de Privacidad</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.botonSalir} onPress={handleCerrarSesion}>
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// — Subcomponentes —

function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={styles.valor} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

interface TarjetaSolicitudProps {
  solicitud: Solicitud;
  esRecibida: boolean;
  misFaltantes?: Set<string>;
  misRepetidas?: Set<string>;
  usuarioId: string;
  onAceptar?: () => void;
  onRechazar?: () => void;
  onCompletado: (id: string, campo: 'completado_solicitante' | 'completado_receptor') => void;
  onEliminar?: () => void;
}

function TarjetaSolicitud({
  solicitud,
  esRecibida,
  misFaltantes = new Set(),
  misRepetidas = new Set(),
  usuarioId,
  onAceptar,
  onRechazar,
  onCompletado,
  onEliminar,
}: TarjetaSolicitudProps) {
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const {
    estado, otro_nombre, otro_whatsapp,
    laminas_solicitadas, laminas_ofrecidas, nota,
  } = solicitud;

  const autoPendiente = esRecibida && estado === 'pendiente';

  const [expandido, setExpandido]             = useState(autoPendiente);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [detalleCargado, setDetalleCargado]   = useState(false);
  const [repsSolicitante, setRepsSolicitante] = useState<string[]>([]);
  const [faltantesSolicitante, setFaltantesSolicitante] = useState<string[]>([]);

  // Estado de valoración
  const [yaValoro, setYaValoro]       = useState(false);
  const [estrellas, setEstrellas]     = useState(0);
  const [enviandoVal, setEnviandoVal] = useState(false);
  const [completando, setCompletando] = useState(false);

  // Completado
  const yoCompletado   = esRecibida ? solicitud.completado_receptor    : solicitud.completado_solicitante;
  const otroCompletado = esRecibida ? solicitud.completado_solicitante : solicitud.completado_receptor;

  useEffect(() => {
    if (autoPendiente) cargarDetalleData();
    if (estado === 'aceptada') verificarValoracion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verificarValoracion() {
    const { data } = await supabase
      .from('valoraciones')
      .select('id')
      .eq('evaluador_id', usuarioId)
      .eq('solicitud_id', solicitud.id)
      .maybeSingle();
    setYaValoro(!!data);
  }

  async function enviarValoracion() {
    if (estrellas === 0) {
      Alert.alert('Selecciona una calificación', 'Toca una estrella para calificar.');
      return;
    }
    const evaluadoId = esRecibida ? solicitud.solicitante_id : solicitud.receptor_id;
    setEnviandoVal(true);
    const { error } = await supabase.from('valoraciones').insert({
      evaluador_id: usuarioId,
      evaluado_id:  evaluadoId,
      solicitud_id: solicitud.id,
      puntos:       estrellas,
    });
    setEnviandoVal(false);
    if (!error) {
      setYaValoro(true);
    } else {
      Alert.alert('Error', 'No se pudo guardar la valoración.');
    }
  }

  async function handleCompletarIntercambio() {
    const campo: 'completado_solicitante' | 'completado_receptor' = esRecibida
      ? 'completado_receptor'
      : 'completado_solicitante';
    setCompletando(true);
    // .select('id') devuelve las filas realmente actualizadas — si RLS bloquea
    // silenciosamente el UPDATE, data queda vacío y detectamos el fallo
    const { data: actualizado, error } = await supabase
      .from('solicitudes')
      .update({ [campo]: true })
      .eq('id', solicitud.id)
      .select('id');
    setCompletando(false);
    if (error || !actualizado || actualizado.length === 0) {
      Alert.alert('Error', 'No se pudo marcar el intercambio como completado.');
      return;
    }
    onCompletado(solicitud.id, campo);
    // Notificar al otro usuario para que confirme su parte
    const otroId = esRecibida ? solicitud.solicitante_id : solicitud.receptor_id;
    const { data: pf } = await supabase
      .from('perfiles')
      .select('expo_push_token')
      .eq('usuario_id', otroId)
      .maybeSingle();
    if (pf?.expo_push_token) {
      await enviarNotificacion(
        pf.expo_push_token,
        '¡Intercambio marcado como completado!',
        `${otro_nombre} ya confirmó su parte. Entra a MiCromo para confirmar la tuya.`,
      );
    }
  }

  async function cargarDetalleData() {
    if (detalleCargado) return;
    setCargandoDetalle(true);
    const { data } = await supabase
      .from('laminas_usuario')
      .select('numero_lamina, estado')
      .eq('usuario_id', solicitud.solicitante_id);

    const rows      = data ?? [];
    const tieneSet  = new Set(rows.filter(r => r.estado === 'tenida' || r.estado === 'repetida').map(r => r.numero_lamina as string));
    setRepsSolicitante(rows.filter(r => r.estado === 'repetida').map(r => r.numero_lamina as string).sort());
    setFaltantesSolicitante(TODOS_CODIGOS.filter(c => !tieneSet.has(c)));
    setDetalleCargado(true);
    setCargandoDetalle(false);
  }

  async function toggleDetalle() {
    if (expandido) { setExpandido(false); return; }
    setExpandido(true);
    await cargarDetalleData();
  }

  const estadoConfig = {
    pendiente: { label: 'Pendiente', color: '#f4a261' },
    aceptada:  { label: 'Aceptada',  color: '#2a9d8f' },
    rechazada: { label: 'Rechazada', color: '#aaa'    },
  };
  const cfg = estadoConfig[estado] ?? estadoConfig.pendiente;

  const misMatchesQueLeOfrezco = [...misRepetidas].filter(c => faltantesSolicitante.includes(c));

  return (
    <View style={styles.tarjetaSolicitud}>
      {/* Cabecera */}
      <View style={styles.solicitudHeader}>
        <Text style={styles.solicitudNombre}>
          {esRecibida ? `De: ${otro_nombre}` : `Para: ${otro_nombre}`}
        </Text>
        <View style={styles.headerDerecha}>
          <View style={[styles.estadoBadge, { backgroundColor: cfg.color + '22' }]}>
            <Text style={[styles.estadoTexto, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          {esRecibida && !autoPendiente && (
            <TouchableOpacity onPress={toggleDetalle} activeOpacity={0.7} style={styles.btnExpand}>
              <Text style={styles.chevronDetalle}>{expandido ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Nota */}
      {nota ? (
        <View style={styles.notaBox}>
          <Text style={styles.notaTexto}>💬 "{nota}"</Text>
        </View>
      ) : null}

      {/* Chips te pide / pediste */}
      <Text style={styles.secLabel}>{esRecibida ? 'Te pide' : 'Pediste'}</Text>
      <View style={styles.chipsWrap}>
        {laminas_solicitadas.map(cod => {
          const tengoRepetida = misRepetidas.has(cod);
          return (
            <View key={cod} style={[styles.chip, tengoRepetida && styles.chipAzul]}>
              <Text style={[styles.chipTexto, tengoRepetida && styles.chipTextoClaro]}>{cod}</Text>
            </View>
          );
        })}
      </View>

      {/* Chips te ofrece / ofreciste */}
      <Text style={styles.secLabel}>{esRecibida ? 'Te ofrece' : 'Ofreciste'}</Text>
      <View style={styles.chipsWrap}>
        {laminas_ofrecidas.map(cod => {
          const meLaFalta = misFaltantes.has(cod);
          return (
            <View key={cod} style={[styles.chip, meLaFalta && styles.chipVerde]}>
              <Text style={[styles.chipTexto, meLaFalta && styles.chipTextoClaro]}>{cod}</Text>
            </View>
          );
        })}
      </View>

      {/* WhatsApp si aceptada */}
      {estado === 'aceptada' && otro_whatsapp && (
        <TouchableOpacity
          style={styles.botonWA}
          onPress={() => Linking.openURL(`https://wa.me/${otro_whatsapp}`).catch(() => {})}
          activeOpacity={0.8}
        >
          <Text style={styles.botonWATexto}>WhatsApp: {otro_whatsapp}</Text>
        </TouchableOpacity>
      )}

      {/* Marcar completado */}
      {estado === 'aceptada' && !yoCompletado && (
        <TouchableOpacity
          style={styles.botonCompletar}
          onPress={handleCompletarIntercambio}
          disabled={completando}
          activeOpacity={0.8}
        >
          {completando
            ? <ActivityIndicator size="small" color="#2a9d8f" />
            : <Text style={styles.botonCompletarTexto}>Marcar intercambio como completado</Text>}
        </TouchableOpacity>
      )}
      {estado === 'aceptada' && yoCompletado && !otroCompletado && (
        <Text style={styles.completadoMio}>✓ Marcado por ti · Esperando confirmación de {otro_nombre}</Text>
      )}
      {estado === 'aceptada' && yoCompletado && otroCompletado && (
        <Text style={styles.completadoAmbos}>✓ ¡Intercambio completado por ambos!</Text>
      )}

      {/* Valorar */}
      {estado === 'aceptada' && !yaValoro && (
        <View style={styles.seccionValorar}>
          <Text style={styles.valorarTitulo}>¿Cómo fue el intercambio con {otro_nombre}?</Text>
          <View style={styles.estrellas}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setEstrellas(n)} activeOpacity={0.7}>
                <Text style={[styles.estrella, n <= estrellas && styles.estrellaActiva]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          {estrellas > 0 && (
            <TouchableOpacity
              style={[styles.botonValorar, enviandoVal && { opacity: 0.6 }]}
              onPress={enviarValoracion}
              disabled={enviandoVal}
              activeOpacity={0.8}
            >
              {enviandoVal
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.botonValorarTexto}>Enviar valoración</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}
      {estado === 'aceptada' && yaValoro && (
        <Text style={styles.yaValorado}>★ Ya valoraste este intercambio</Text>
      )}

      {/* Detalle expandido — solo para recibidas */}
      {expandido && (
        <View style={styles.detalleExpand}>
          {cargandoDetalle ? (
            <ActivityIndicator size="small" color="#e63946" style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Text style={styles.detalleTitulo}>
                {'Repetidas de ' + otro_nombre + ' (' + repsSolicitante.length + ')'}
                {repsSolicitante.filter(c => misFaltantes.has(c)).length > 0
                  ? '  ·  ' + repsSolicitante.filter(c => misFaltantes.has(c)).length + ' que te faltan ↓'
                  : ''}
              </Text>
              {repsSolicitante.length === 0 ? (
                <Text style={styles.sinDetalle}>No tiene láminas repetidas registradas.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {repsSolicitante.map(cod => {
                    const meLaFalta = misFaltantes.has(cod);
                    return (
                      <View key={cod} style={[styles.chip, meLaFalta && styles.chipVerde]}>
                        <Text style={[styles.chipTexto, meLaFalta && styles.chipTextoClaro]}>{cod}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.detalleTitulo, { marginTop: 12 }]}>
                Tus repetidas que le faltan ({misMatchesQueLeOfrezco.length})
              </Text>
              {misMatchesQueLeOfrezco.length === 0 ? (
                <Text style={styles.sinDetalle}>Ninguna de tus repetidas le falta a este coleccionista.</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {misMatchesQueLeOfrezco.map(cod => (
                    <View key={cod} style={[styles.chip, styles.chipAzul]}>
                      <Text style={[styles.chipTexto, styles.chipTextoClaro]}>{cod}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Botones aceptar / rechazar */}
      {esRecibida && estado === 'pendiente' && (
        <View style={styles.botonesSolicitud}>
          <TouchableOpacity style={styles.botonAceptar} onPress={onAceptar} activeOpacity={0.8}>
            <Text style={styles.botonAceptarTexto}>Aceptar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.botonRechazar} onPress={onRechazar} activeOpacity={0.8}>
            <Text style={styles.botonRechazarTexto}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botón eliminar — solo para enviadas */}
      {!esRecibida && onEliminar && (
        <TouchableOpacity onPress={onEliminar} activeOpacity={0.7} style={styles.btnEliminarSolicitud}>
          <Text style={styles.btnEliminarSolicitudTexto}>Eliminar solicitud</Text>
        </TouchableOpacity>
      )}
    </View>
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
  container: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  contenido: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#e63946',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitulo: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  tarjeta: {
    backgroundColor: t.tarjeta,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: t.sep,
    paddingBottom: 8,
  },
  etiqueta: {
    fontSize: 14,
    color: t.textoTer,
    fontWeight: '600',
  },
  valor: {
    fontSize: 15,
    color: t.texto,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  botonEditar: {
    backgroundColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
  },
  botonEditarTexto: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  botonHistorial: {
    borderWidth: 1.5,
    borderColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    marginTop: -12,
  },
  botonHistorialTexto: {
    color: '#e63946',
    fontSize: 14,
    fontWeight: '600',
  },
  seccionTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: t.texto,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sinSolicitudes: {
    fontSize: 13,
    color: t.textoDes,
    marginHorizontal: 16,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  // Tarjeta solicitud
  tarjetaSolicitud: {
    backgroundColor: t.tarjeta,
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  solicitudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  solicitudNombre: {
    fontSize: 14,
    fontWeight: '700',
    color: t.texto,
    flex: 1,
    marginRight: 8,
  },
  headerDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  estadoBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  estadoTexto: {
    fontSize: 11,
    fontWeight: '700',
  },
  btnExpand: {
    padding: 4,
  },
  chevronDetalle: {
    fontSize: 11,
    color: t.textoDes,
  },
  notaBox: {
    backgroundColor: t.fondoNaranja,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f4a261',
  },
  notaTexto: {
    fontSize: 13,
    color: '#7c5a2e',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  secLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: t.textoDes,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 6,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 4,
  },
  chip: {
    backgroundColor: t.alt,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipTexto: {
    fontSize: 12,
    color: t.textoSec,
    fontWeight: '600',
  },
  chipVerde: {
    backgroundColor: '#2a9d8f',
  },
  chipAzul: {
    backgroundColor: '#457b9d',
  },
  chipTextoClaro: {
    color: '#fff',
  },
  botonWA: {
    backgroundColor: '#25D366',
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  botonWATexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // Completado / valoración
  seccionValorar: {
    borderTopWidth: 1,
    borderTopColor: t.sep,
    marginTop: 12,
    paddingTop: 12,
    alignItems: 'center',
    gap: 8,
  },
  valorarTitulo: {
    fontSize: 13,
    color: t.textoSec,
    textAlign: 'center',
    fontWeight: '600',
  },
  botonCompletar: {
    borderWidth: 1.5,
    borderColor: '#2a9d8f',
    borderRadius: 7,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  botonCompletarTexto: {
    color: '#2a9d8f',
    fontSize: 13,
    fontWeight: '700',
  },
  completadoMio: {
    fontSize: 12,
    color: t.textoTer,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  completadoAmbos: {
    fontSize: 13,
    color: '#2a9d8f',
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  // Valorar
  estrellas: {
    flexDirection: 'row',
    gap: 8,
  },
  estrella: {
    fontSize: 28,
    color: t.borde,
  },
  estrellaActiva: {
    color: '#f4a261',
  },
  botonValorar: {
    backgroundColor: '#f4a261',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  botonValorarTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  yaValorado: {
    fontSize: 12,
    color: '#f4a261',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  // Detalle expandido
  detalleExpand: {
    borderTopWidth: 1,
    borderTopColor: t.sep,
    marginTop: 10,
    paddingTop: 10,
  },
  detalleTitulo: {
    fontSize: 11,
    fontWeight: '700',
    color: t.textoTer,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sinDetalle: {
    fontSize: 12,
    color: t.textoDes,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  // Acciones
  botonesSolicitud: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  botonAceptar: {
    flex: 1,
    backgroundColor: '#2a9d8f',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  botonAceptarTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  botonRechazar: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: t.bordeInput,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  botonRechazarTexto: {
    color: t.textoTer,
    fontSize: 13,
    fontWeight: '600',
  },
  btnEliminarSolicitud: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 6,
  },
  btnEliminarSolicitudTexto: {
    color: t.textoDes,
    fontSize: 12,
    fontWeight: '600',
  },
  tarjetaContacto: {
    backgroundColor: t.tarjeta,
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    borderLeftWidth: 3,
    borderLeftColor: '#3730a3',
  },
  tarjetaContactoAceptada: {
    borderLeftColor: '#2a9d8f',
  },
  contactoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactoNombre: {
    fontSize: 14,
    fontWeight: '700',
    color: t.texto,
    flex: 1,
    marginRight: 8,
  },
  contactoPrecio: {
    fontSize: 16,
    fontWeight: '800',
    color: t.texto,
    marginBottom: 8,
  },
  botonesContacto: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btnAceptarContacto: {
    flex: 1,
    backgroundColor: '#2a9d8f',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnAceptarContactoTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnRechazarContacto: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: t.bordeInput,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnRechazarContactoTexto: {
    color: t.textoTer,
    fontSize: 13,
    fontWeight: '600',
  },
  badgeConteo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3730a3',
  },
  botonSalir: {
    borderWidth: 2,
    borderColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
  },
  botonSalirTexto: {
    color: '#e63946',
    fontSize: 15,
    fontWeight: '700',
  },
  btnReporte: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnReporteIcono: {
    fontSize: 17,
    color: '#fff',
  },
  filaToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: t.sep,
    marginTop: 4,
  },
  filaToggleLabel: {
    fontSize: 14,
    color: t.textoSec,
    fontWeight: '500',
  },
  toggleBoton: {
    padding: 4,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.oscuro ? '#555' : '#ccc',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.oscuro ? '#e63946' : '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  linkPrivacidad: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  linkPrivacidadTexto: {
    fontSize: 13,
    color: t.textoDes,
    textDecorationLine: 'underline',
  },
  });
}
