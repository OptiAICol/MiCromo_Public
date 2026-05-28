import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { enviarNotificacion } from '@/lib/notificaciones';
import { useTheme, Tema } from '@/hooks/useTheme';
import ModalReporte from '@/components/ModalReporte';
import ErrorRed from '@/components/ErrorRed';

type ContactoEstado = 'ninguno' | 'pendiente' | 'aceptada' | 'rechazada';

type PerfilVendedor = {
  nombre: string;
  ciudad: string;
};

type Anuncio = {
  id:               string;
  vendedor_id:      string;
  laminas:          string[];
  descripcion:      string;
  precio:           number;
  destacado:        boolean;
  activo:           boolean;
  created_at:       string;
  perfiles:         PerfilVendedor | null;
  contactoEstado:   ContactoEstado;
  vendedorWhatsapp: string | null;
};

type FiltroAnuncios = 'todos' | 'mis';

const ETIQUETAS_FILTRO: Record<FiltroAnuncios, string> = {
  todos: 'Todos',
  mis:   'Mis anuncios',
};

const PAGINA_SIZE = 20;

function formatCOP(valor: number): string {
  return '$' + Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function AnunciosScreen() {
  const { usuario } = useAuth();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [anuncios, setAnuncios]               = useState<Anuncio[]>([]);
  const [filtro, setFiltro]                   = useState<FiltroAnuncios>('todos');
  const [ordenPrecio, setOrdenPrecio]         = useState<'asc' | 'desc' | null>(null);
  const [busqueda, setBusqueda]               = useState('');
  const [busquedaDebounced, setBusquedaDeb]   = useState('');
  const [filtroCiudad, setFiltroCiudad]       = useState('');
  const [cargando, setCargando]               = useState(true);
  const [hayMas, setHayMas]                   = useState(true);
  const [cargandoMas, setCargandoMas]         = useState(false);
  const [modalVisible, setModal]             = useState(false);
  const [modalContactoVisible, setModalContacto] = useState(false);
  const [anuncioContacto, setAnuncioContacto]    = useState<Anuncio | null>(null);
  const [mensajeContacto, setMensajeContacto]    = useState('');
  const [enviandoContacto, setEnviandoContacto]  = useState(false);

  const [codigos, setCodigos]         = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio]           = useState('');
  const [errorModal, setErrorModal]   = useState<string | null>(null);
  const [publicando, setPublicando]   = useState(false);
  const [modalReporte, setModalReporte] = useState(false);
  const [editandoId, setEditandoId]   = useState<string | null>(null);
  const [errorRed, setErrorRed]       = useState(false);

  const pagRef         = useRef(0);
  const hayMasRef      = useRef(true);
  const cargandoMasRef = useRef(false);
  // generación para evitar race conditions al cambiar filtros
  const genRef         = useRef(0);
  // evita doble carga en el primer render (useFocusEffect + useEffect)
  const primeraVez     = useRef(true);
  // siempre apunta a la versión más reciente de iniciarCargaAnuncios (evita closure stale)
  const iniciarCargaRef = useRef(iniciarCargaAnuncios);
  iniciarCargaRef.current = iniciarCargaAnuncios;
  const filtroCiudadRef      = useRef('');
  const ciudadEstablecidaRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      iniciarCargaRef.current();
    }, []),
  );

  // Debounce de búsqueda: espera 450ms antes de lanzar la query
  useEffect(() => {
    const id = setTimeout(() => {
      setBusquedaDeb(busqueda.trim().toUpperCase());
    }, 450);
    return () => clearTimeout(id);
  }, [busqueda]);

  // Recarga al cambiar filtro, orden o búsqueda (sin doble carga en mount)
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    iniciarCargaAnuncios();
  }, [filtro, ordenPrecio, busquedaDebounced]);

  async function iniciarCargaAnuncios() {
    const gen = ++genRef.current;
    setCargando(true);
    setErrorRed(false);
    pagRef.current    = 0;
    hayMasRef.current = true;
    setAnuncios([]);

    // En el primer mount, cargar la ciudad del usuario como filtro por defecto
    if (!ciudadEstablecidaRef.current && usuario?.id) {
      ciudadEstablecidaRef.current = true;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('ciudad')
        .eq('usuario_id', usuario.id)
        .maybeSingle();
      if (perfil?.ciudad) {
        filtroCiudadRef.current = perfil.ciudad;
        setFiltroCiudad(perfil.ciudad);
      }
    }

    const datos = await fetchPagina(0, filtro, ordenPrecio, usuario?.id, busquedaDebounced, filtroCiudadRef.current);
    if (gen !== genRef.current) return;

    // Con búsqueda activa se trajo todo de una vez — no hay más páginas
    const tieneMas = busquedaDebounced.length === 0 && datos.length === PAGINA_SIZE;
    setAnuncios(datos);
    hayMasRef.current = tieneMas;
    setHayMas(tieneMas);
    pagRef.current    = PAGINA_SIZE;
    setCargando(false);
  }

  async function cargarMasAnuncios() {
    if (!hayMasRef.current || cargandoMasRef.current) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);

    const desde = pagRef.current;
    const datos = await fetchPagina(desde, filtro, ordenPrecio, usuario?.id, busquedaDebounced, filtroCiudadRef.current);

    setAnuncios(prev => [...prev, ...datos]);
    const nuevaHayMas      = datos.length === PAGINA_SIZE;
    hayMasRef.current      = nuevaHayMas;
    setHayMas(nuevaHayMas);
    pagRef.current         = desde + PAGINA_SIZE;
    cargandoMasRef.current = false;
    setCargandoMas(false);
  }

  function limpiarCiudad() {
    filtroCiudadRef.current = '';
    setFiltroCiudad('');
    iniciarCargaAnuncios();
  }

  async function fetchPagina(
    desde: number,
    filtroActual: FiltroAnuncios,
    ordenActual: 'asc' | 'desc' | null,
    uid: string | undefined,
    busquedaActual: string,
    filtroCiudadActual: string,
  ): Promise<Anuncio[]> {
    const hasta = desde + PAGINA_SIZE - 1;
    // Con búsqueda activa se trae un bloque grande y se filtra client-side,
    // porque PostgREST no soporta cast (::text) dentro de .or() en columnas array
    const enBusqueda = busquedaActual.length > 0;

    // Filtro de ciudad server-side (solo en modo "todos", no en "mis anuncios")
    let uidsEnCiudad: string[] | null = null;
    if (filtroCiudadActual && filtroActual !== 'mis') {
      const { data: perfilesEnCiudad } = await supabase
        .from('perfiles')
        .select('usuario_id')
        .eq('ciudad', filtroCiudadActual);
      uidsEnCiudad = (perfilesEnCiudad ?? []).map(p => p.usuario_id as string);
      if (uidsEnCiudad.length === 0) return [];
    }

    let q = supabase
      .from('anuncios')
      .select('id, vendedor_id, laminas, descripcion, precio, destacado, activo, created_at')
      .eq('activo', true);

    if (enBusqueda) q = q.limit(200);
    else            q = q.range(desde, hasta);

    if (filtroActual === 'mis' && uid)   q = q.eq('vendedor_id', uid);
    if (filtroActual === 'todos' && uid) q = q.neq('vendedor_id', uid);

    // Filtro de ciudad
    if (uidsEnCiudad !== null) q = q.in('vendedor_id', uidsEnCiudad);

    if (ordenActual === 'asc')       q = q.order('precio', { ascending: true });
    else if (ordenActual === 'desc') q = q.order('precio', { ascending: false });
    else                             q = q.order('destacado', { ascending: false }).order('created_at', { ascending: false });

    const { data: anunciosData, error } = await q;

    if (error) {
      console.error('Error cargando anuncios:', error.message);
      if (desde === 0) setErrorRed(true);
      return [];
    }
    if (!anunciosData || anunciosData.length === 0) return [];

    // Filtro client-side por lámina cuando hay búsqueda activa
    const raw = enBusqueda
      ? anunciosData.filter(a => (a.laminas as string[]).some(l => l.includes(busquedaActual)))
      : anunciosData;
    if (raw.length === 0) return [];

    const uids = [...new Set(raw.map(a => a.vendedor_id as string))];
    const { data: perfilesData } = await supabase
      .from('perfiles')
      .select('usuario_id, nombre, ciudad')
      .in('usuario_id', uids);

    const perfilesMap: Record<string, PerfilVendedor> = {};
    for (const p of perfilesData ?? []) {
      perfilesMap[p.usuario_id] = { nombre: p.nombre ?? '', ciudad: p.ciudad ?? '' };
    }

    // Cargar contactos por vendedor (no solo por anuncio) para bloquear otros anuncios del mismo vendedor
    let anuncioContactMap: Record<string, { estado: ContactoEstado; whatsapp: string | null }> = {};
    let vendorContactMap:  Record<string, { estado: ContactoEstado; whatsapp: string | null }> = {};

    if (uid && raw.length > 0) {
      const vendorIds = [...new Set(raw.map(a => a.vendedor_id as string))];
      const { data: cData } = await supabase
        .from('contactos_anuncio')
        .select('anuncio_id, vendedor_id, estado')
        .eq('comprador_id', uid)
        .in('vendedor_id', vendorIds);

      for (const c of cData ?? []) {
        const estado = c.estado as ContactoEstado;
        anuncioContactMap[c.anuncio_id] = { estado, whatsapp: null };
        // Nivel vendedor: aceptada > pendiente > rechazada
        const cur = vendorContactMap[c.vendedor_id];
        if (!cur || estado === 'aceptada' || (estado === 'pendiente' && cur.estado !== 'aceptada')) {
          vendorContactMap[c.vendedor_id] = { estado, whatsapp: null };
        }
      }

      // Solo para vendedores con contacto aceptado, obtener su WhatsApp
      const vendoresAceptados = Object.entries(vendorContactMap)
        .filter(([, v]) => v.estado === 'aceptada')
        .map(([id]) => id);
      if (vendoresAceptados.length > 0) {
        const { data: waData } = await supabase
          .rpc('get_whatsapp_vendedores_aceptados', { p_vendedor_ids: vendoresAceptados });
        for (const p of waData ?? []) {
          const wa = p.whatsapp ?? null;
          vendorContactMap[p.usuario_id].whatsapp = wa;
          for (const [aid, av] of Object.entries(anuncioContactMap)) {
            const anuncio = raw.find(a => a.id === aid);
            if (anuncio?.vendedor_id === p.usuario_id && av.estado === 'aceptada') {
              anuncioContactMap[aid].whatsapp = wa;
            }
          }
        }
      }
    }

    return raw.map(a => {
      const propio      = anuncioContactMap[a.id];
      const vendorNivel = vendorContactMap[a.vendedor_id];
      let estado:   ContactoEstado = 'ninguno';
      let whatsapp: string | null  = null;

      if (propio) {
        estado   = propio.estado;
        whatsapp = propio.whatsapp;
      } else if (vendorNivel && vendorNivel.estado !== 'rechazada') {
        // Bloquear otros anuncios del mismo vendedor si hay contacto activo
        estado   = vendorNivel.estado;
        whatsapp = vendorNivel.whatsapp;
      }

      return {
        ...a,
        perfiles:         perfilesMap[a.vendedor_id] ?? null,
        contactoEstado:   estado,
        vendedorWhatsapp: whatsapp,
      };
    });
  }

  async function eliminarAnuncio(id: string) {
    const { error } = await supabase
      .from('anuncios')
      .update({ activo: false })
      .eq('id', id);

    if (!error) setAnuncios(prev => prev.filter(a => a.id !== id));
  }

  function editarAnuncio(item: Anuncio) {
    setEditandoId(item.id);
    setCodigos(item.laminas.join(', '));
    setDescripcion(item.descripcion ?? '');
    setPrecio(item.precio.toString());
    setErrorModal(null);
    setModal(true);
  }

  function contactarWhatsApp(anuncio: Anuncio) {
    const tel  = anuncio.vendedorWhatsapp ?? '';
    const text = encodeURIComponent(
      `Hola, vi tu anuncio en MiCromo sobre las láminas: ${anuncio.laminas.join(', ')}. ¿Aún disponible?`,
    );
    Linking.openURL(`https://wa.me/${tel}?text=${text}`);
  }

  function handleSolicitarContacto(anuncio: Anuncio) {
    if (!usuario) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para contactar a un vendedor.');
      return;
    }
    setAnuncioContacto(anuncio);
    setMensajeContacto('');
    setModalContacto(true);
  }

  async function enviarSolicitudContacto() {
    if (!anuncioContacto || !usuario) return;
    setEnviandoContacto(true);

    const { error } = await supabase.from('contactos_anuncio').insert({
      anuncio_id:   anuncioContacto.id,
      comprador_id: usuario.id,
      vendedor_id:  anuncioContacto.vendedor_id,
      mensaje:      mensajeContacto.trim() || null,
      estado:       'pendiente',
    });

    setEnviandoContacto(false);

    if (error) {
      Alert.alert('Error', 'No se pudo enviar la solicitud.');
      return;
    }

    setAnuncios(prev => prev.map(a =>
      a.id === anuncioContacto.id ? { ...a, contactoEstado: 'pendiente' as ContactoEstado } : a,
    ));

    // Notificar al vendedor
    const { data: vPerfil } = await supabase
      .from('perfiles')
      .select('expo_push_token')
      .eq('usuario_id', anuncioContacto.vendedor_id)
      .maybeSingle();
    if (vPerfil?.expo_push_token) {
      await enviarNotificacion(
        vPerfil.expo_push_token,
        'Nueva solicitud de contacto',
        `Alguien quiere comprar tus láminas: ${anuncioContacto.laminas.slice(0, 3).join(', ')}`,
      );
    }

    setModalContacto(false);
    Alert.alert('Solicitud enviada', 'El vendedor revisará tu solicitud y te avisará.');
  }

  async function publicarAnuncio() {
    const lista = codigos
      .toUpperCase()
      .split(/[\s,;]+/)
      .map(c => c.trim())
      .filter(Boolean);

    if (lista.length === 0) {
      setErrorModal('Ingresa al menos un código de lámina.');
      return;
    }
    const valorPrecio = parseFloat(precio.replace(/\./g, '').replace(',', '.'));
    if (!valorPrecio || valorPrecio <= 0) {
      setErrorModal('Ingresa un precio válido mayor a 0.');
      return;
    }

    setErrorModal(null);
    setPublicando(true);

    if (editandoId) {
      const { error } = await supabase
        .from('anuncios')
        .update({ laminas: lista, descripcion: descripcion.trim(), precio: valorPrecio })
        .eq('id', editandoId)
        .eq('vendedor_id', usuario!.id);

      setPublicando(false);
      if (error) { setErrorModal('Error al guardar. Intenta de nuevo.'); return; }

      setAnuncios(prev => prev.map(a =>
        a.id === editandoId
          ? { ...a, laminas: lista, descripcion: descripcion.trim(), precio: valorPrecio }
          : a,
      ));
      setModal(false);
      setCodigos(''); setDescripcion(''); setPrecio(''); setEditandoId(null);
      return;
    }

    const { data: existentes } = await supabase
      .from('anuncios')
      .select('laminas')
      .eq('vendedor_id', usuario!.id)
      .eq('activo', true);

    const duplicados = (existentes ?? [])
      .flatMap(a => a.laminas as string[])
      .filter(c => lista.includes(c));

    if (duplicados.length > 0) {
      setPublicando(false);
      Alert.alert('Códigos ya publicados', `Ya tienes anuncios activos con: ${duplicados.join(', ')}`);
      return;
    }

    const { error } = await supabase.from('anuncios').insert({
      vendedor_id: usuario!.id,
      laminas:     lista,
      descripcion: descripcion.trim(),
      precio:      valorPrecio,
      destacado:   false,
      activo:      true,
    });

    setPublicando(false);

    if (error) {
      console.error('Error publicando anuncio:', error.message, error);
      Alert.alert('Error al publicar', error.message);
      setErrorModal('Error al publicar. Intenta de nuevo.');
      return;
    }

    setModal(false);
    setCodigos('');
    setDescripcion('');
    setPrecio('');
    iniciarCargaAnuncios();
  }

  function renderAnuncio({ item }: { item: Anuncio }) {
    const esPropio = item.vendedor_id === usuario?.id;
    return (
      <View style={[styles.card, item.destacado && styles.cardDestacado]}>
        {item.destacado && (
          <View style={styles.badgeDestacado}>
            <Text style={styles.textoBadge}>★ Destacado</Text>
          </View>
        )}

        <View style={styles.chips}>
          {item.laminas.map(cod => (
            <View key={cod} style={styles.chip}>
              <Text style={styles.textoChip}>{cod}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.precio}>{formatCOP(item.precio)}</Text>

        {!!item.descripcion && (
          <Text style={styles.descripcion} numberOfLines={3}>{item.descripcion}</Text>
        )}

        <Text style={styles.vendedor}>
          {item.perfiles?.nombre ?? 'Usuario'} · {item.perfiles?.ciudad ?? ''}
        </Text>

        {esPropio ? (
          <View style={styles.btnsPropio}>
            <TouchableOpacity
              style={[styles.btnPropio, styles.btnEditarPropio]}
              onPress={() => editarAnuncio(item)}
              activeOpacity={0.75}
            >
              <Text style={styles.textoBtnEditarPropio}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPropio, styles.btnEliminar]}
              onPress={() => eliminarAnuncio(item.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.textoBtnEliminar}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        ) : item.contactoEstado === 'aceptada' ? (
          <TouchableOpacity
            style={styles.btnWhatsapp}
            onPress={() => contactarWhatsApp(item)}
            activeOpacity={0.75}
          >
            <Text style={styles.textoBtnWhatsapp}>Contactar por WhatsApp</Text>
          </TouchableOpacity>
        ) : item.contactoEstado === 'pendiente' ? (
          <View style={styles.btnEstado}>
            <Text style={styles.textoBtnEstado}>Solicitud enviada · Esperando respuesta...</Text>
          </View>
        ) : item.contactoEstado === 'rechazada' ? (
          <View style={[styles.btnEstado, styles.btnEstadoRechazado]}>
            <Text style={[styles.textoBtnEstado, styles.textoBtnEstadoRechazado]}>Solicitud rechazada</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.btnSolicitar}
            onPress={() => handleSolicitarContacto(item)}
            activeOpacity={0.75}
          >
            <Text style={styles.textoBtnSolicitar}>Contactar Vendedor</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ModalReporte visible={modalReporte} onCerrar={() => setModalReporte(false)} />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerFila}>
          <Text style={styles.tituloHeader}>Tablón de anuncios</Text>
          <TouchableOpacity onPress={() => setModalReporte(true)} activeOpacity={0.8} style={styles.btnReporte}>
            <Text style={styles.btnReporteIcono}>⚠</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filtros}>
          {(Object.keys(ETIQUETAS_FILTRO) as FiltroAnuncios[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.botonFiltro, filtro === f && styles.botonFiltroActivo]}
              onPress={() => setFiltro(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.textoFiltro, filtro === f && styles.textoFiltroActivo]}>
                {ETIQUETAS_FILTRO[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.botonOrden, ordenPrecio !== null && styles.botonOrdenActivo]}
          onPress={() => setOrdenPrecio(p => p === null ? 'desc' : p === 'desc' ? 'asc' : null)}
          activeOpacity={0.7}
        >
          <Text style={[styles.textoOrden, ordenPrecio !== null && styles.textoOrdenActivo]}>
            {ordenPrecio === 'asc' ? 'Menor precio ↑' : ordenPrecio === 'desc' ? 'Mayor precio ↓' : 'Precio ↕'}
          </Text>
        </TouchableOpacity>

        {filtroCiudad ? (
          <View style={styles.chipCiudadWrap}>
            <Text style={styles.chipCiudadTexto}>📍 {filtroCiudad}</Text>
            <TouchableOpacity onPress={limpiarCiudad} style={styles.chipCiudadX}>
              <Text style={styles.chipCiudadXTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.wrapperBusqueda}>
          <TextInput
            style={styles.inputBusqueda}
            placeholder="Buscar por código (ej: COL1)"
            placeholderTextColor="rgba(255,255,255,0.55)"
            value={busqueda}
            onChangeText={setBusqueda}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda('')} style={styles.btnLimpiar}>
              <Text style={styles.textoLimpiar}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Lista */}
      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color="#e63946" />
        </View>
      ) : errorRed ? (
        <ErrorRed onReintentar={iniciarCargaAnuncios} />
      ) : anuncios.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.textoVacio}>
            {busquedaDebounced
              ? `Sin resultados para "${busquedaDebounced}"`
              : filtroCiudad
              ? `Sin anuncios en ${filtroCiudad} por ahora.`
              : 'No hay anuncios aquí todavía.'}
          </Text>
          {!busquedaDebounced && !filtroCiudad && <Text style={styles.textoVacioSub}>¡Sé el primero en publicar!</Text>}
        </View>
      ) : (
        <FlatList
          data={anuncios}
          keyExtractor={item => item.id}
          renderItem={renderAnuncio}
          contentContainerStyle={styles.lista}
          onEndReached={cargarMasAnuncios}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            cargandoMas ? (
              <ActivityIndicator
                size="small"
                color="#e63946"
                style={{ paddingVertical: 20 }}
              />
            ) : (
              <Text style={styles.disclaimer}>
                MiCromo es solo un tablón. Las transacciones son responsabilidad de las partes.
              </Text>
            )
          }
        />
      )}

      {/* FAB */}
      {usuario && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setModal(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.textoFab}>+</Text>
        </TouchableOpacity>
      )}

      {/* Modal solicitar contacto */}
      <Modal
        visible={modalContactoVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalContacto(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContenido}>
            <Text style={styles.modalTitulo}>Solicitar contacto</Text>
            {anuncioContacto && (
              <>
                <View style={styles.chips}>
                  {anuncioContacto.laminas.map(cod => (
                    <View key={cod} style={styles.chip}>
                      <Text style={styles.textoChip}>{cod}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.modalPrecio}>{formatCOP(anuncioContacto.precio)}</Text>
                <Text style={styles.modalVendedor}>
                  {anuncioContacto.perfiles?.nombre ?? 'Usuario'} · {anuncioContacto.perfiles?.ciudad ?? ''}
                </Text>
              </>
            )}
            <TextInput
              style={[styles.inputModal, styles.inputMultilinea]}
              placeholder="Mensaje para el vendedor (opcional)"
              placeholderTextColor="#aaa"
              value={mensajeContacto}
              onChangeText={setMensajeContacto}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.modalAviso}>
              Si el vendedor acepta tu solicitud, podrás ver su WhatsApp para concretar la compra.
            </Text>
            <View style={styles.botonesModal}>
              <Pressable
                style={styles.btnCancelar}
                onPress={() => setModalContacto(false)}
              >
                <Text style={styles.textoBtnCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.btnPublicar, enviandoContacto && styles.btnDeshabilitado]}
                onPress={enviarSolicitudContacto}
                disabled={enviandoContacto}
              >
                {enviandoContacto
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.textoBtnPublicar}>Enviar solicitud</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal crear / editar anuncio */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContenido}>
            <Text style={styles.modalTitulo}>{editandoId ? 'Editar anuncio' : 'Nuevo anuncio'}</Text>

            <TextInput
              style={styles.inputModal}
              placeholder="Códigos de láminas (ej: COL1, ARG3, BRA7)"
              placeholderTextColor="#aaa"
              value={codigos}
              onChangeText={setCodigos}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.inputModal, styles.inputMultilinea]}
              placeholder="Descripción (opcional)"
              placeholderTextColor="#aaa"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              numberOfLines={3}
            />
            <TextInput
              style={styles.inputModal}
              placeholder="Precio en COP (ej: 5000)"
              placeholderTextColor="#aaa"
              value={precio}
              onChangeText={setPrecio}
              keyboardType="numeric"
            />

            {errorModal !== null && (
              <Text style={styles.errorModal}>{errorModal}</Text>
            )}

            <View style={styles.botonesModal}>
              <Pressable
                style={styles.btnCancelar}
                onPress={() => { setModal(false); setErrorModal(null); setEditandoId(null); }}
              >
                <Text style={styles.textoBtnCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.btnPublicar, publicando && styles.btnDeshabilitado]}
                onPress={publicarAnuncio}
                disabled={publicando}
              >
                {publicando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.textoBtnPublicar}>{editandoId ? 'Guardar cambios' : 'Publicar'}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  header: {
    backgroundColor: '#e63946',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tituloHeader: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
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
  filtros: {
    flexDirection: 'row',
    gap: 6,
  },
  botonFiltro: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  botonFiltroActivo: {
    backgroundColor: '#fff',
  },
  textoFiltro: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  textoFiltroActivo: {
    color: '#e63946',
  },
  botonOrden: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  botonOrdenActivo: {
    backgroundColor: '#fff',
  },
  textoOrden: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  textoOrdenActivo: {
    color: '#e63946',
  },
  wrapperBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    marginTop: 8,
  },
  inputBusqueda: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    paddingVertical: 0,
  },
  btnLimpiar: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  textoLimpiar: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  textoVacio: {
    fontSize: 16,
    fontWeight: '600',
    color: t.textoSec,
    textAlign: 'center',
  },
  textoVacioSub: {
    fontSize: 13,
    color: t.textoTer,
    marginTop: 6,
    textAlign: 'center',
  },
  lista: {
    padding: 12,
    gap: 10,
    paddingBottom: 90,
  },
  card: {
    backgroundColor: t.tarjeta,
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDestacado: {
    borderWidth: 1.5,
    borderColor: '#f4a261',
  },
  badgeDestacado: {
    alignSelf: 'flex-start',
    backgroundColor: '#f4a261',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  textoBadge: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: t.fondoIndigo,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  textoChip: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730a3',
  },
  precio: {
    fontSize: 18,
    fontWeight: '800',
    color: t.texto,
    marginBottom: 4,
  },
  descripcion: {
    fontSize: 13,
    color: t.textoSec,
    marginBottom: 6,
    lineHeight: 18,
  },
  vendedor: {
    fontSize: 12,
    color: t.textoTer,
    marginBottom: 10,
  },
  btnSolicitar: {
    backgroundColor: '#3730a3',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  textoBtnSolicitar: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnEstado: {
    backgroundColor: t.alt,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  textoBtnEstado: {
    color: t.textoTer,
    fontSize: 12,
    fontWeight: '600',
  },
  btnEstadoRechazado: {
    backgroundColor: t.fondoRojo,
  },
  textoBtnEstadoRechazado: {
    color: '#e63946',
  },
  modalPrecio: {
    fontSize: 18,
    fontWeight: '800',
    color: t.texto,
    marginBottom: 4,
  },
  modalVendedor: {
    fontSize: 12,
    color: t.textoTer,
    marginBottom: 12,
  },
  modalAviso: {
    fontSize: 12,
    color: t.textoTer,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  btnWhatsapp: {
    backgroundColor: '#25d366',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  textoBtnWhatsapp: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnsPropio: {
    flexDirection: 'row',
    gap: 8,
  },
  btnPropio: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnEditarPropio: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    backgroundColor: t.alt,
  },
  textoBtnEditarPropio: {
    color: t.textoSec,
    fontSize: 13,
    fontWeight: '700',
  },
  btnEliminar: {
    borderWidth: 1,
    borderColor: '#e63946',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  textoBtnEliminar: {
    color: '#e63946',
    fontSize: 13,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: t.textoDes,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e63946',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#e63946',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  textoFab: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContenido: {
    backgroundColor: t.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: '700',
    color: t.texto,
    marginBottom: 18,
  },
  inputModal: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: t.texto,
    marginBottom: 12,
    backgroundColor: t.input,
  },
  inputMultilinea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorModal: {
    color: '#e63946',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  botonesModal: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btnCancelar: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.bordeInput,
    alignItems: 'center',
  },
  textoBtnCancelar: {
    color: t.textoSec,
    fontSize: 15,
    fontWeight: '600',
  },
  btnPublicar: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#e63946',
    alignItems: 'center',
  },
  btnDeshabilitado: {
    opacity: 0.6,
  },
  textoBtnPublicar: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  chipCiudadWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  chipCiudadTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  chipCiudadX: {
    paddingHorizontal: 2,
  },
  chipCiudadXTexto: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
  });
}
