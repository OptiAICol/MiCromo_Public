import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { DEPARTAMENTOS } from '@/constants/ciudades';
import { SECCIONES_ALBUM } from '@/constants/laminas';
import { useTheme, Tema } from '@/hooks/useTheme';
import ModalReporte from '@/components/ModalReporte';
import ErrorRed from '@/components/ErrorRed';

const TODOS_CODIGOS = SECCIONES_ALBUM.flatMap(s => s.laminas);
const PAGINA_SIZE   = 15;

type PerfilUsuario = {
  usuario_id: string;
  nombre:     string;
  ciudad:     string;
};

type OfertaIntercambio = {
  id:                       string;
  usuario_id:               string;
  laminas_ofrezco:          string[];
  laminas_busco:            string[];
  busco_cualquier_faltante: boolean;
  activo:                   boolean;
  created_at:               string;
};

type OfertaEnriquecida = OfertaIntercambio & {
  perfil:        PerfilUsuario | null;
  matchMeFaltan: number;
  matchLeFaltan: number;
  chipsOfrece:   string[];
  chipsBusca:    string[];
  puntuacion:    number | null;
  totalVotos:    number;
};

function ofreceTodas(o: OfertaIntercambio) {
  return o.laminas_ofrezco.length === 0;
}

function sortScore(o: OfertaEnriquecida): number {
  if (o.matchMeFaltan > 0 && o.matchLeFaltan > 0) return 0;
  if (o.matchMeFaltan > 0) return 1;
  if (o.matchLeFaltan > 0) return 2;
  return 3;
}

export default function IntercambiosScreen() {
  const { usuario } = useAuth();
  const router      = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [miOferta, setMiOferta]         = useState<OfertaIntercambio | null>(null);
  const [feed, setFeed]                 = useState<OfertaEnriquecida[]>([]);
  const [misFaltantes, setMisFaltantes] = useState<Set<string>>(new Set());
  const [misRepetidas, setMisRepetidas] = useState<Set<string>>(new Set());
  const [cargando, setCargando]         = useState(true);
  const [hayMas, setHayMas]             = useState(true);
  const [cargandoMas, setCargandoMas]   = useState(false);
  const [busqueda, setBusqueda]               = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [filtroDep, setFiltroDep]             = useState('');
  const [filtroCiudad, setFiltroCiudad]       = useState('');
  const [expandidas, setExpandidas]     = useState<Set<string>>(new Set());
  const [modalFiltro, setModalFiltro]   = useState(false);
  const [modalOferta, setModalOferta]   = useState(false);
  const [modoEditar, setModoEditar]     = useState(false);

  const [ofrezco, setOfrezco]               = useState('');
  const [ofrezcoTodas, setOfrezcoTodas]     = useState(false);
  const [busco, setBusco]                   = useState('');
  const [buscoCualquier, setBuscoCualquier] = useState(false);
  const [errorModal, setErrorModal]         = useState<string | null>(null);
  const [publicando, setPublicando]         = useState(false);
  const [modalReporte, setModalReporte]     = useState(false);
  const [errorRed, setErrorRed]             = useState(false);

  // refs para paginación y closures frescos
  const pagRef          = useRef(0);
  const hayMasRef       = useRef(true);
  const cargandoMasRef  = useRef(false);
  // generación para evitar race conditions al cambiar el filtro de departamento
  const genRef          = useRef(0);
  const misFaltantesRef = useRef<Set<string>>(new Set());
  const misRepetidasRef = useRef<Set<string>>(new Set());
  // ref para dept filter (evita closures stale en useFocusEffect)
  const filtroDepRef       = useRef(filtroDep);
  filtroDepRef.current     = filtroDep;
  // ref para ciudad (filtro por defecto desde el perfil del usuario)
  const filtroCiudadRef        = useRef(filtroCiudad);
  filtroCiudadRef.current      = filtroCiudad;
  const ciudadEstablecidaRef   = useRef(false);
  // ref para búsqueda debounced (evita stale closures en cargarPagina)
  const busquedaRef        = useRef(busquedaDebounced);
  busquedaRef.current      = busquedaDebounced;
  // evita doble carga en mount cuando filtroDep o busqueda cambian por primera vez
  const primeraVezDep      = useRef(true);
  const primeraVezBus      = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (usuario) iniciarCarga();
    }, [usuario]),
  );

  // Debounce búsqueda 450ms
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim().toUpperCase()), 450);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Recarga feed cuando cambia el filtro de departamento
  useEffect(() => {
    if (primeraVezDep.current) { primeraVezDep.current = false; return; }
    recargarFeed();
  }, [filtroDep]);

  // Recarga feed cuando cambia la búsqueda debounced
  useEffect(() => {
    if (primeraVezBus.current) { primeraVezBus.current = false; return; }
    recargarFeed();
  }, [busquedaDebounced]);

  async function iniciarCarga() {
    setCargando(true);
    setErrorRed(false);
    pagRef.current    = 0;
    hayMasRef.current = true;
    setFeed([]);

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

    const [
      { data: misLaminasData },
      { data: miOfertaData },
    ] = await Promise.all([
      supabase
        .from('laminas_usuario')
        .select('numero_lamina, estado')
        .eq('usuario_id', usuario!.id),
      supabase
        .from('ofertas_intercambio')
        .select('id, usuario_id, laminas_ofrezco, laminas_busco, busco_cualquier_faltante, activo, created_at')
        .eq('activo', true)
        .eq('usuario_id', usuario!.id)
        .maybeSingle(),
    ]);

    const misLaminas   = misLaminasData ?? [];
    const tieneSet     = new Set(misLaminas.filter(r => r.estado === 'tenida' || r.estado === 'repetida').map(r => r.numero_lamina as string));
    const faltantesSet = new Set(TODOS_CODIGOS.filter(c => !tieneSet.has(c)));
    const repetidasSet = new Set(misLaminas.filter(r => r.estado === 'repetida').map(r => r.numero_lamina as string));

    misFaltantesRef.current = faltantesSet;
    misRepetidasRef.current = repetidasSet;
    setMisFaltantes(faltantesSet);
    setMisRepetidas(repetidasSet);
    setMiOferta(miOfertaData as OfertaIntercambio | null);

    await cargarPagina(0, filtroDepRef.current, busquedaRef.current, filtroCiudadRef.current);
    setCargando(false);
  }

  // Recarga solo el feed (sin recargar mis láminas ni mi oferta)
  async function recargarFeed() {
    const gen = ++genRef.current;
    setCargando(true);
    pagRef.current    = 0;
    hayMasRef.current = true;
    setFeed([]);
    await cargarPagina(0, filtroDepRef.current, busquedaRef.current, filtroCiudadRef.current, gen);
    if (gen !== genRef.current) return;
    setCargando(false);
  }

  async function cargarPagina(desde: number, filtroDepActual: string, busquedaActual: string, filtroCiudadActual: string, gen?: number) {
    const hasta = desde + PAGINA_SIZE - 1;

    // Filtro de ciudad server-side (toma prioridad sobre departamento)
    let uidsEnCiudad: string[] | null = null;
    if (filtroCiudadActual) {
      const { data: perfilesEnCiudad } = await supabase
        .from('perfiles')
        .select('usuario_id')
        .eq('ciudad', filtroCiudadActual);
      uidsEnCiudad = (perfilesEnCiudad ?? []).map(p => p.usuario_id as string);
      if (uidsEnCiudad.length === 0) {
        hayMasRef.current = false;
        setHayMas(false);
        return;
      }
    }

    // Filtro de departamento (solo si no hay filtro de ciudad activo)
    let uidsEnDep: string[] | null = null;
    if (!filtroCiudadActual && filtroDepActual) {
      const { data: perfilesEnDep } = await supabase
        .from('perfiles')
        .select('usuario_id')
        .ilike('ciudad', `%, ${filtroDepActual}`);
      uidsEnDep = (perfilesEnDep ?? []).map(p => p.usuario_id as string);
      if (uidsEnDep.length === 0) {
        hayMasRef.current = false;
        setHayMas(false);
        return;
      }
    }

    let q = supabase
      .from('ofertas_intercambio')
      .select('id, usuario_id, laminas_ofrezco, laminas_busco, busco_cualquier_faltante, activo, created_at')
      .eq('activo', true)
      .neq('usuario_id', usuario!.id)
      .order('created_at', { ascending: false })
      .range(desde, hasta);

    if (uidsEnCiudad !== null) q = q.in('usuario_id', uidsEnCiudad);
    else if (uidsEnDep !== null) q = q.in('usuario_id', uidsEnDep);
    if (busquedaActual) {
      q = q.or(`laminas_ofrezco::text.ilike.%${busquedaActual}%,laminas_busco::text.ilike.%${busquedaActual}%`);
    }

    const { data: ofertasOtros, error: errOfertas } = await q;

    if (errOfertas) {
      console.error('Error cargando ofertas:', errOfertas.message);
      if (desde === 0) setErrorRed(true);
      return;
    }

    if (!ofertasOtros || ofertasOtros.length === 0) {
      hayMasRef.current = false;
      setHayMas(false);
      return;
    }

    const nuevaHayMas   = ofertasOtros.length === PAGINA_SIZE;
    hayMasRef.current   = nuevaHayMas;
    setHayMas(nuevaHayMas);

    const uidsOtros = [...new Set((ofertasOtros as OfertaIntercambio[]).map(o => o.usuario_id))];

    const [
      { data: perfilesData,     error: errPerfiles },
      { data: laminasOtrosData, error: errLaminasOtros },
      { data: ratingsData },
    ] = await Promise.all([
      supabase.from('perfiles').select('usuario_id, nombre, ciudad').in('usuario_id', uidsOtros),
      supabase.from('laminas_usuario').select('usuario_id, numero_lamina, estado').in('usuario_id', uidsOtros),
      supabase.from('valoraciones').select('evaluado_id, puntos').in('evaluado_id', uidsOtros),
    ]);

    if (errPerfiles)     console.error('Error perfiles:', errPerfiles.message);
    if (errLaminasOtros) console.error('Error láminas otros:', errLaminasOtros.message);

    const perfilesMap: Record<string, PerfilUsuario> = {};
    for (const p of perfilesData ?? []) {
      perfilesMap[p.usuario_id] = {
        usuario_id: p.usuario_id,
        nombre:     p.nombre ?? '',
        ciudad:     p.ciudad ?? '',
      };
    }

    const repetidasMap: Record<string, Set<string>> = {};
    const tienenMap:    Record<string, Set<string>> = {};
    for (const row of laminasOtrosData ?? []) {
      if (row.estado === 'repetida') {
        if (!repetidasMap[row.usuario_id]) repetidasMap[row.usuario_id] = new Set();
        repetidasMap[row.usuario_id].add(row.numero_lamina as string);
      }
      if (row.estado === 'tenida' || row.estado === 'repetida') {
        if (!tienenMap[row.usuario_id]) tienenMap[row.usuario_id] = new Set();
        tienenMap[row.usuario_id].add(row.numero_lamina as string);
      }
    }

    const faltantesMap: Record<string, Set<string>> = {};
    for (const uid of uidsOtros) {
      const tienen = tienenMap[uid] ?? new Set<string>();
      faltantesMap[uid] = new Set(TODOS_CODIGOS.filter(c => !tienen.has(c)));
    }

    const ratingsMap: Record<string, { sum: number; count: number }> = {};
    for (const r of ratingsData ?? []) {
      if (!ratingsMap[r.evaluado_id]) ratingsMap[r.evaluado_id] = { sum: 0, count: 0 };
      ratingsMap[r.evaluado_id].sum   += (r.puntos as number);
      ratingsMap[r.evaluado_id].count += 1;
    }

    const faltantesSet = misFaltantesRef.current;
    const repetidasSet = misRepetidasRef.current;

    const enriquecidas: OfertaEnriquecida[] = (ofertasOtros as OfertaIntercambio[]).map(o => {
      const chipsOfrece: string[] = ofreceTodas(o)
        ? [...(repetidasMap[o.usuario_id] ?? new Set<string>())].filter(c => faltantesSet.has(c))
        : o.laminas_ofrezco;

      const chipsBusca: string[] = [...repetidasSet].filter(c => faltantesMap[o.usuario_id]?.has(c) ?? false);

      const matchMeFaltan = ofreceTodas(o)
        ? chipsOfrece.length
        : chipsOfrece.filter(c => faltantesSet.has(c)).length;

      const matchLeFaltan = chipsBusca.length;

      const rm = ratingsMap[o.usuario_id];

      return {
        ...o,
        perfil:     perfilesMap[o.usuario_id] ?? null,
        matchMeFaltan,
        matchLeFaltan,
        chipsOfrece,
        chipsBusca,
        puntuacion: rm ? rm.sum / rm.count : null,
        totalVotos: rm?.count ?? 0,
      };
    });

    enriquecidas.sort((a, b) => sortScore(a) - sortScore(b));

    // descartar respuesta si llegó una carga más reciente (race condition)
    if (gen !== undefined && gen !== genRef.current) return;

    if (desde === 0) {
      setFeed(enriquecidas);
    } else {
      setFeed(prev => [...prev, ...enriquecidas]);
    }

    pagRef.current = desde + PAGINA_SIZE;
  }

  async function cargarMas() {
    if (!hayMasRef.current || cargandoMasRef.current) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    await cargarPagina(pagRef.current, filtroDepRef.current, busquedaRef.current, filtroCiudadRef.current);
    cargandoMasRef.current = false;
    setCargandoMas(false);
  }

  function limpiarCiudad() {
    filtroCiudadRef.current = '';
    setFiltroCiudad('');
    recargarFeed();
  }

  function toggleExpandida(id: string) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function eliminarOferta() {
    if (!miOferta) return;
    const { error } = await supabase
      .from('ofertas_intercambio')
      .update({ activo: false })
      .eq('id', miOferta.id);
    if (!error) setMiOferta(null);
  }

  function abrirCrear() {
    setModoEditar(false);
    setOfrezco('');
    setOfrezcoTodas(false);
    setBusco('');
    setBuscoCualquier(false);
    setErrorModal(null);
    setModalOferta(true);
  }

  function abrirEditar() {
    if (!miOferta) return;
    setModoEditar(true);
    const todasRepetidas = ofreceTodas(miOferta);
    setOfrezcoTodas(todasRepetidas);
    setOfrezco(todasRepetidas ? '' : miOferta.laminas_ofrezco.join(', '));
    setBuscoCualquier(miOferta.busco_cualquier_faltante);
    setBusco(miOferta.busco_cualquier_faltante ? '' : miOferta.laminas_busco.join(', '));
    setErrorModal(null);
    setModalOferta(true);
  }

  async function guardarOferta() {
    const listaOfrezco = ofrezcoTodas
      ? []
      : ofrezco.toUpperCase().split(/[\s,;]+/).map(c => c.trim()).filter(Boolean);

    if (!ofrezcoTodas && listaOfrezco.length === 0) {
      setErrorModal('Ingresa al menos un código en "Láminas que ofrezco" o activa el toggle.');
      return;
    }

    const listaBusco = buscoCualquier
      ? []
      : busco.toUpperCase().split(/[\s,;]+/).map(c => c.trim()).filter(Boolean);

    setErrorModal(null);
    setPublicando(true);

    const { error } = await supabase
      .from('ofertas_intercambio')
      .upsert(
        {
          usuario_id:               usuario!.id,
          laminas_ofrezco:          listaOfrezco,
          laminas_busco:            listaBusco,
          busco_cualquier_faltante: buscoCualquier,
          activo:                   true,
        },
        { onConflict: 'usuario_id' },
      );

    setPublicando(false);

    if (error) {
      console.error('Error guardando oferta:', error.message, error);
      Alert.alert('Error al guardar oferta', error.message);
      setErrorModal('Error al guardar. Intenta de nuevo.');
      return;
    }

    setModalOferta(false);
    iniciarCarga();
  }

  // Búsqueda y filtro de departamento se aplican server-side al recargar el feed

  function renderOferta({ item }: { item: OfertaEnriquecida }) {
    const { chipsOfrece, chipsBusca } = item;
    const expandida = expandidas.has(item.id);

    return (
      <View style={styles.tarjeta}>
        {/* Cabecera — siempre visible */}
        <TouchableOpacity
          style={styles.tarjetaHeaderTap}
          onPress={() => toggleExpandida(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.tarjetaHeaderInfo}>
            <View style={styles.filaUsuario}>
              <Text style={styles.nombreUsuario}>{item.perfil?.nombre ?? 'Usuario'}</Text>
              {item.puntuacion !== null && (
                <Text style={styles.ratingText}>
                  ★ {item.puntuacion.toFixed(1)}
                  {item.totalVotos > 0 ? ` (${item.totalVotos})` : ''}
                </Text>
              )}
            </View>
            <Text style={styles.ciudadUsuario}>{item.perfil?.ciudad || 'Sin ciudad registrada'}</Text>
            <View style={styles.previewBadges}>
              {item.matchMeFaltan > 0 && (
                <View style={styles.bannerVerde}>
                  <Text style={styles.textoBannerVerde}>
                    ✓ Tiene {item.matchMeFaltan} lámina{item.matchMeFaltan > 1 ? 's' : ''} que te {item.matchMeFaltan > 1 ? 'faltan' : 'falta'}
                  </Text>
                </View>
              )}
              {item.matchLeFaltan > 0 && (
                <View style={styles.bannerAzul}>
                  <Text style={styles.textoBannerAzul}>
                    ✓ Necesita {item.matchLeFaltan} de tus repetidas
                  </Text>
                </View>
              )}
              {item.matchMeFaltan === 0 && item.matchLeFaltan === 0 && (
                <Text style={styles.textoSinMatch}>Sin coincidencias directas</Text>
              )}
            </View>
          </View>
          <Text style={styles.chevron}>{expandida ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {/* Detalle expandido */}
        {expandida && (
          <View style={styles.detalleExpandido}>
            <Text style={styles.secLabel}>Ofrece</Text>
            {ofreceTodas(item) ? (
              chipsOfrece.length === 0 ? (
                <Text style={styles.textoSinMatch}>No tiene repetidas que te falten</Text>
              ) : (
                <View style={styles.chipsWrap}>
                  {chipsOfrece.map(cod => (
                    <View key={cod} style={[styles.chip, styles.chipVerde]}>
                      <Text style={[styles.chipTexto, styles.chipTextoVerde]}>{cod}</Text>
                    </View>
                  ))}
                </View>
              )
            ) : (
              <View style={styles.chipsWrap}>
                {chipsOfrece.map(cod => {
                  const esMatch = misFaltantes.has(cod);
                  return (
                    <View key={cod} style={[styles.chip, esMatch && styles.chipVerde]}>
                      <Text style={[styles.chipTexto, esMatch && styles.chipTextoVerde]}>{cod}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.secLabel}>Puedes darle</Text>
            {chipsBusca.length === 0 ? (
              <Text style={styles.textoSinMatch}>No necesita tus repetidas</Text>
            ) : (
              <View style={styles.chipsWrap}>
                {chipsBusca.map(cod => (
                  <View key={cod} style={[styles.chip, styles.chipAzul]}>
                    <Text style={[styles.chipTexto, styles.chipTextoAzul]}>{cod}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.botonSolicitar}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: '/solicitud',
                  params: {
                    receptor_id:     item.usuario_id,
                    receptor_nombre: item.perfil?.nombre ?? 'Usuario',
                    receptor_ciudad: item.perfil?.ciudad ?? '',
                  },
                })
              }
            >
              <Text style={styles.botonSolicitarTexto}>Solicitar intercambio</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const headerLista = miOferta ? (
    <View style={styles.seccionMiOferta}>
      <Text style={styles.seccionTitulo}>Mi oferta activa</Text>
      <View style={styles.tarjetaMia}>
        <Text style={styles.secLabel}>Ofrece</Text>
        {ofreceTodas(miOferta) ? (
          <Text style={styles.textoInfoMia}>Todas sus repetidas</Text>
        ) : (
          <View style={styles.chipsWrap}>
            {miOferta.laminas_ofrezco.map(cod => (
              <View key={cod} style={styles.chip}>
                <Text style={styles.chipTexto}>{cod}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.secLabel, { marginTop: 8 }]}>Busca</Text>
        {miOferta.busco_cualquier_faltante ? (
          <Text style={styles.textoInfoMia}>Cualquier lámina faltante</Text>
        ) : miOferta.laminas_busco.length > 0 ? (
          <Text style={styles.textoInfoMia} numberOfLines={2}>
            {miOferta.laminas_busco.join(', ')}
          </Text>
        ) : (
          <Text style={styles.textoInfoMia}>—</Text>
        )}

        <View style={styles.botonesOfertaMia}>
          <TouchableOpacity style={styles.btnEditar} onPress={abrirEditar} activeOpacity={0.75}>
            <Text style={styles.textoBtnEditar}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnEliminarOferta} onPress={eliminarOferta} activeOpacity={0.75}>
            <Text style={styles.textoBtnEliminar}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.seccionTitulo}>Intercambios disponibles</Text>
    </View>
  ) : null;

  return (
    <View style={styles.contenedor}>
      <ModalReporte visible={modalReporte} onCerrar={() => setModalReporte(false)} />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerFila}>
          <Text style={styles.titulo}>Mercado</Text>
          <TouchableOpacity onPress={() => setModalReporte(true)} activeOpacity={0.8} style={styles.btnReporte}>
            <Text style={styles.btnReporteIcono}>⚠</Text>
          </TouchableOpacity>
        </View>

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

        {filtroCiudad ? (
          <View style={styles.chipCiudadWrap}>
            <Text style={styles.chipCiudadTexto}>📍 {filtroCiudad}</Text>
            <TouchableOpacity onPress={limpiarCiudad} style={styles.chipCiudadX}>
              <Text style={styles.chipCiudadXTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.botonFiltro} onPress={() => setModalFiltro(true)}>
            <Text style={styles.botonFiltroTexto} numberOfLines={1}>
              {filtroDep || 'Todos los departamentos'} ▼
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Lista */}
      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color="#e63946" />
        </View>
      ) : errorRed ? (
        <ErrorRed onReintentar={iniciarCarga} />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={item => item.id}
          renderItem={renderOferta}
          ListHeaderComponent={headerLista}
          contentContainerStyle={styles.lista}
          onEndReached={cargarMas}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.vacio}>
              <Text style={styles.vacioTitulo}>Sin intercambios disponibles</Text>
              <Text style={styles.vacioTexto}>
                {filtroCiudad
                  ? `Nadie en ${filtroCiudad} tiene ofertas activas por ahora.`
                  : filtroDep
                  ? `Nadie en ${filtroDep} tiene ofertas activas por ahora.`
                  : 'Aún no hay ofertas. ¡Crea la tuya con el botón +!'}
              </Text>
            </View>
          }
          ListFooterComponent={
            cargandoMas ? (
              <ActivityIndicator
                size="small"
                color="#e63946"
                style={{ paddingVertical: 20 }}
              />
            ) : feed.length > 0 ? (
              <Text style={styles.disclaimer}>
                MiCromo es solo un tablón de encuentro. Los intercambios ocurren directamente entre las partes y son de su exclusiva responsabilidad.
              </Text>
            ) : null
          }
        />
      )}

      {/* FAB */}
      {usuario && (
        <TouchableOpacity
          style={styles.fab}
          onPress={miOferta ? abrirEditar : abrirCrear}
          activeOpacity={0.85}
        >
          <Text style={[styles.textoFab, miOferta && styles.textoFabEditar]}>
            {miOferta ? '✎' : '+'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Modal filtro departamento */}
      <Modal
        visible={modalFiltro}
        animationType="slide"
        transparent
        onRequestClose={() => setModalFiltro(false)}
      >
        <TouchableOpacity
          style={styles.modalFondo}
          activeOpacity={1}
          onPress={() => setModalFiltro(false)}
        >
          <View style={styles.modalContenido}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Filtrar por departamento</Text>
              <TouchableOpacity onPress={() => setModalFiltro(false)}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.itemDep, !filtroDep && styles.itemDepActivo]}
              onPress={() => { setFiltroDep(''); setModalFiltro(false); }}
            >
              <Text style={[styles.itemDepTexto, !filtroDep && styles.itemDepTextoActivo]}>
                Todos los departamentos
              </Text>
            </TouchableOpacity>
            <FlatList
              data={DEPARTAMENTOS}
              keyExtractor={dep => dep}
              renderItem={({ item: dep }) => (
                <TouchableOpacity
                  style={[styles.itemDep, filtroDep === dep && styles.itemDepActivo]}
                  onPress={() => { setFiltroDep(dep); setModalFiltro(false); }}
                >
                  <Text style={[styles.itemDepTexto, filtroDep === dep && styles.itemDepTextoActivo]}>
                    {dep}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal crear / editar oferta */}
      <Modal
        visible={modalOferta}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOferta(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalCrearOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCrearContenido}>
            <Text style={styles.modalTitulo}>
              {modoEditar ? 'Editar mi oferta' : 'Nueva oferta'}
            </Text>

            <View style={styles.filaToggle}>
              <Text style={styles.labelToggle}>
                Ofrezco todas mis repetidas
                {ofrezcoTodas && misRepetidas.size > 0 ? ` (${misRepetidas.size} láminas)` : ''}
              </Text>
              <Switch
                value={ofrezcoTodas}
                onValueChange={v => { setOfrezcoTodas(v); if (v) setOfrezco(''); }}
                trackColor={{ false: '#ddd', true: '#2a9d8f' }}
                thumbColor="#fff"
              />
            </View>

            {!ofrezcoTodas && (
              <TextInput
                style={styles.inputModal}
                placeholder="Láminas que ofrezco (ej: COL1, ARG3)"
                placeholderTextColor="#aaa"
                value={ofrezco}
                onChangeText={setOfrezco}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            )}

            <View style={styles.filaToggle}>
              <Text style={styles.labelToggle}>Busco cualquier lámina que me falte</Text>
              <Switch
                value={buscoCualquier}
                onValueChange={v => { setBuscoCualquier(v); if (v) setBusco(''); }}
                trackColor={{ false: '#ddd', true: '#e63946' }}
                thumbColor="#fff"
              />
            </View>

            {!buscoCualquier && (
              <TextInput
                style={styles.inputModal}
                placeholder="Láminas que busco (ej: BRA5, FRA2)"
                placeholderTextColor="#aaa"
                value={busco}
                onChangeText={setBusco}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            )}

            {errorModal !== null && (
              <Text style={styles.errorModal}>{errorModal}</Text>
            )}

            <View style={styles.botonesModal}>
              <Pressable
                style={styles.btnCancelar}
                onPress={() => { setModalOferta(false); setErrorModal(null); }}
              >
                <Text style={styles.textoBtnCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.btnPublicar, publicando && styles.btnDeshabilitado]}
                onPress={guardarOferta}
                disabled={publicando}
              >
                {publicando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.textoBtnPublicar}>
                      {modoEditar ? 'Guardar cambios' : 'Publicar'}
                    </Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#e63946',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  headerFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  titulo: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  wrapperBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
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
  botonFiltro: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  botonFiltroTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 260,
  },
  lista: {
    padding: 12,
    gap: 10,
    paddingBottom: 90,
  },
  seccionMiOferta: {
    marginBottom: 4,
  },
  seccionTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: t.textoSec,
    marginBottom: 8,
    marginTop: 4,
  },
  tarjeta: {
    backgroundColor: t.tarjeta,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tarjetaHeaderTap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
  },
  tarjetaHeaderInfo: {
    flex: 1,
  },
  filaUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  nombreUsuario: {
    fontSize: 15,
    fontWeight: '700',
    color: t.texto,
  },
  ratingText: {
    fontSize: 12,
    color: '#f4a261',
    fontWeight: '700',
  },
  ciudadUsuario: {
    fontSize: 12,
    color: t.textoTer,
    marginTop: 1,
  },
  previewBadges: {
    marginTop: 6,
    gap: 4,
  },
  detalleExpandido: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: t.sep,
  },
  secLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: t.textoDes,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 2,
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
  chipTextoVerde: {
    color: '#fff',
  },
  chipAzul: {
    backgroundColor: '#457b9d',
  },
  chipTextoAzul: {
    color: '#fff',
  },
  textoSinMatch: {
    fontSize: 12,
    color: t.textoDes,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  bannerVerde: {
    backgroundColor: t.fondoVerde,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  textoBannerVerde: {
    fontSize: 12,
    color: '#2a9d8f',
    fontWeight: '700',
  },
  bannerAzul: {
    backgroundColor: t.fondoAzul,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  textoBannerAzul: {
    fontSize: 12,
    color: '#457b9d',
    fontWeight: '700',
  },
  botonSolicitar: {
    backgroundColor: '#e63946',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  botonSolicitarTexto: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  tarjetaMia: {
    backgroundColor: t.tarjeta,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  textoInfoMia: {
    fontSize: 13,
    color: t.textoSec,
    marginBottom: 2,
  },
  botonesOfertaMia: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnEditar: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#457b9d',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  textoBtnEditar: {
    color: '#457b9d',
    fontSize: 13,
    fontWeight: '700',
  },
  btnEliminarOferta: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e63946',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  textoBtnEliminar: {
    color: '#e63946',
    fontSize: 13,
    fontWeight: '700',
  },
  vacio: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    gap: 10,
  },
  vacioTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: t.textoSec,
    textAlign: 'center',
  },
  vacioTexto: {
    fontSize: 14,
    color: t.textoTer,
    textAlign: 'center',
    lineHeight: 20,
  },
  disclaimer: {
    fontSize: 12,
    color: t.textoDes,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    lineHeight: 17,
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
  chevron: {
    fontSize: 11,
    color: t.textoDes,
    marginLeft: 8,
  },
  textoFab: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  textoFabEditar: {
    fontSize: 22,
    fontWeight: '400',
  },
  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContenido: {
    backgroundColor: t.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: t.sep,
  },
  modalTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: t.texto,
    marginBottom: 16,
  },
  modalCerrar: {
    fontSize: 18,
    color: t.textoTer,
    paddingHorizontal: 4,
  },
  itemDep: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: t.sep,
  },
  itemDepActivo: {
    backgroundColor: t.fondoRojo,
  },
  itemDepTexto: {
    fontSize: 15,
    color: t.textoSec,
  },
  itemDepTextoActivo: {
    color: '#e63946',
    fontWeight: '700',
  },
  modalCrearOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCrearContenido: {
    backgroundColor: t.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
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
  filaToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  labelToggle: {
    fontSize: 14,
    color: t.textoSec,
    flex: 1,
    marginRight: 12,
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
