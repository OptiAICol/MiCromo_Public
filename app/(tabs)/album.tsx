import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { SECCIONES_ALBUM, TOTAL_LAMINAS } from '@/constants/laminas';
import type { SeccionAlbum } from '@/constants/laminas';
import { useTheme, Tema } from '@/hooks/useTheme';
import ModalReporte from '@/components/ModalReporte';
import ErrorRed from '@/components/ErrorRed';

type EstadoLamina = 'tenida' | 'repetida' | 'faltante' | null;
type EntradaLamina = { estado: EstadoLamina; cantidad: number };
type Filtro = 'todas' | 'tenidas' | 'repetidas' | 'faltantes';

const ETIQUETAS_FILTRO: Record<Filtro, string> = {
  todas:     'Todas',
  tenidas:   'Listas',
  repetidas: 'Repetidas',
  faltantes: 'Faltantes',
};

const CHIP_W = Math.floor((Dimensions.get('window').width - 60) / 5);

const COLOR_CHIP: Record<string, string> = {
  tenida:   '#2a9d8f',
  repetida: '#457b9d',
  faltante: '#e63946',
};

const ENTRADA_VACIA: EntradaLamina = { estado: 'faltante', cantidad: 0 };

export default function AlbumScreen() {
  const { usuario } = useAuth();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const [laminas, setLaminas]       = useState<Record<string, EntradaLamina>>({});
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cargando, setCargando]     = useState(true);
  const [filtro, setFiltro]         = useState<Filtro>('todas');
  const [busqueda, setBusqueda]     = useState('');
  const [modalReporte, setModalReporte] = useState(false);
  const [errorRed, setErrorRed]     = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (usuario) cargarEstados();
    }, [usuario]),
  );

  async function cargarEstados() {
    setCargando(true);
    setErrorRed(false);
    const { data, error } = await supabase
      .from('laminas_usuario')
      .select('numero_lamina, estado, cantidad')
      .eq('usuario_id', usuario!.id);

    if (error) {
      setErrorRed(true);
      setCargando(false);
      return;
    }
    if (data) {
      const mapa: Record<string, EntradaLamina> = {};
      for (const row of data) {
        mapa[row.numero_lamina] = {
          estado:   row.estado as EstadoLamina,
          cantidad: row.cantidad ?? 0,
        };
      }
      setLaminas(mapa);
    }
    setCargando(false);
  }

  function toggleExpandido(codigo: string) {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  async function toggleEstado(codigo: string) {
    const actual = laminas[codigo] ?? ENTRADA_VACIA;

    let nuevoEstado: EstadoLamina;
    let nuevaCantidad: number;

    if (actual.estado === 'faltante' || actual.estado === null) {
      nuevoEstado   = 'tenida';
      nuevaCantidad = 0;
    } else if (actual.estado === 'tenida') {
      nuevoEstado   = 'repetida';
      nuevaCantidad = 1;
    } else {
      nuevoEstado   = 'repetida';
      nuevaCantidad = actual.cantidad + 1;
    }

    setLaminas(prev => ({ ...prev, [codigo]: { estado: nuevoEstado, cantidad: nuevaCantidad } }));

    const { error } = await supabase.from('laminas_usuario').upsert(
      { usuario_id: usuario!.id, numero_lamina: codigo, estado: nuevoEstado, cantidad: nuevaCantidad },
      { onConflict: 'usuario_id,numero_lamina' },
    );

    if (error) {
      console.error('Error guardando lámina:', error.message);
      setLaminas(prev => ({ ...prev, [codigo]: actual }));
    }
  }

  async function resetearLamina(codigo: string) {
    const actual = laminas[codigo] ?? ENTRADA_VACIA;
    if (actual.estado === 'faltante') return;

    setLaminas(prev => ({ ...prev, [codigo]: ENTRADA_VACIA }));

    const { error } = await supabase.from('laminas_usuario').upsert(
      { usuario_id: usuario!.id, numero_lamina: codigo, estado: 'faltante', cantidad: 0 },
      { onConflict: 'usuario_id,numero_lamina' },
    );

    if (error) {
      console.error('Error reseteando lámina:', error.message);
      setLaminas(prev => ({ ...prev, [codigo]: actual }));
    }
  }

  function cumpleFiltro(entrada: EntradaLamina): boolean {
    if (filtro === 'todas')     return true;
    if (filtro === 'tenidas')   return entrada.estado === 'tenida' || entrada.estado === 'repetida';
    if (filtro === 'repetidas') return entrada.estado === 'repetida';
    return entrada.estado === 'faltante' || entrada.estado === null;
  }

  const completadas  = Object.values(laminas).filter(e => e.estado === 'tenida' || e.estado === 'repetida').length;
  const busquedaTrim = busqueda.trim().toUpperCase();

  const seccionesVisibles: SeccionAlbum[] = busquedaTrim
    ? SECCIONES_ALBUM.filter(s =>
        s.laminas.some(l => l.toUpperCase().includes(busquedaTrim)),
      )
    : filtro === 'todas'
    ? SECCIONES_ALBUM
    : SECCIONES_ALBUM.filter(s =>
        s.laminas.some(l => cumpleFiltro(laminas[l] ?? ENTRADA_VACIA)),
      );

  function renderSeccion({ item }: { item: SeccionAlbum }) {
    const expandido        = busquedaTrim ? true : expandidos.has(item.codigo);
    const tenidasEnEquipo  = item.laminas.filter(l => {
      const e = laminas[l]?.estado;
      return e === 'tenida' || e === 'repetida';
    }).length;

    const bgBadge =
      tenidasEnEquipo === 0                   ? '#e0e0e0'
      : tenidasEnEquipo === item.laminas.length ? '#457b9d'
      : '#2a9d8f';
    const colorTextoBadge = tenidasEnEquipo === 0 ? '#888' : '#fff';

    const laminasVisibles = busquedaTrim
      ? item.laminas.filter(l => l.toUpperCase().includes(busquedaTrim))
      : filtro === 'todas'
      ? item.laminas
      : item.laminas.filter(l => cumpleFiltro(laminas[l] ?? ENTRADA_VACIA));

    return (
      <View style={styles.seccion}>
        <TouchableOpacity
          style={styles.headerSeccion}
          onPress={() => !busquedaTrim && toggleExpandido(item.codigo)}
          activeOpacity={busquedaTrim ? 1 : 0.7}
        >
          <View style={styles.headerIzquierda}>
            <Text style={styles.nombreEquipo}>{item.nombre}</Text>
            <View style={[styles.badgeContador, { backgroundColor: bgBadge }]}>
              <Text style={[styles.textoBadge, { color: colorTextoBadge }]}>
                {tenidasEnEquipo}/{item.laminas.length}
              </Text>
            </View>
          </View>
          {!busquedaTrim && (
            <Text style={styles.chevron}>{expandido ? '▲' : '▼'}</Text>
          )}
        </TouchableOpacity>

        {expandido && (
          <View style={styles.grid}>
            {laminasVisibles.map(lamina => {
              const entrada = laminas[lamina] ?? ENTRADA_VACIA;
              const estado  = entrada.estado ?? 'faltante';
              return (
                <TouchableOpacity
                  key={lamina}
                  style={[styles.chip, { backgroundColor: COLOR_CHIP[estado] }]}
                  onPress={() => toggleEstado(lamina)}
                  onLongPress={() => resetearLamina(lamina)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipCodigo}>{lamina}</Text>
                  {estado === 'repetida' && (
                    <Text style={styles.chipConteo}>×{entrada.cantidad}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  if (errorRed) {
    return <ErrorRed onReintentar={cargarEstados} />;
  }

  return (
    <View style={styles.contenedor}>
      <ModalReporte visible={modalReporte} onCerrar={() => setModalReporte(false)} />
      <View style={styles.header}>
        <View style={styles.headerFila}>
          <Text style={styles.tituloHeader}>Mi Álbum</Text>
          <TouchableOpacity onPress={() => setModalReporte(true)} activeOpacity={0.8} style={styles.btnReporte}>
            <Text style={styles.btnReporteIcono}>⚠</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.contadorHeader}>
          {completadas}/{TOTAL_LAMINAS} completadas
        </Text>
        <View style={styles.barraFondo}>
          <View
            style={[
              styles.barraRelleno,
              { width: `${Math.min((completadas / TOTAL_LAMINAS) * 100, 100)}%` },
            ]}
          />
        </View>

        <View style={styles.filtros}>
          {(Object.keys(ETIQUETAS_FILTRO) as Filtro[]).map(f => (
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

        <View style={styles.wrapperBusqueda}>
          <TextInput
            style={styles.inputBusqueda}
            placeholder="Buscar por código (ej: COL14)"
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

      <FlatList
        data={seccionesVisibles}
        keyExtractor={item => item.codigo}
        renderItem={renderSeccion}
        extraData={[expandidos, laminas, filtro, busquedaTrim]}
        contentContainerStyle={styles.lista}
      />
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
  contenedor: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  header: {
    backgroundColor: '#e63946',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  tituloHeader: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  contadorHeader: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
    marginBottom: 10,
  },
  barraFondo: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  barraRelleno: {
    height: 6,
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  filtros: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
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
  lista: {
    padding: 10,
    gap: 6,
  },
  seccion: {
    backgroundColor: t.tarjeta,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  headerSeccion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  headerIzquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  nombreEquipo: {
    fontSize: 15,
    fontWeight: '700',
    color: t.texto,
  },
  badgeContador: {
    backgroundColor: t.alt,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  textoBadge: {
    fontSize: 12,
    color: t.textoTer,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 11,
    color: t.textoDes,
    marginLeft: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: t.sep,
  },
  chip: {
    width: CHIP_W,
    height: CHIP_W,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipCodigo: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  chipConteo: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    marginTop: 1,
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
  });
}
