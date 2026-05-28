import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, Tema } from '@/hooks/useTheme';

interface IntercambioCompletado {
  id: string;
  otroNombre: string;
  esRecibida: boolean;
  laminas_solicitadas: string[];
  laminas_ofrecidas: string[];
  created_at: string;
  miCalificacion: number | null;
  suCalificacion: number | null;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Estrellas({ puntos, t }: { puntos: number; t: Tema }) {
  return (
    <Text style={{ color: '#f4a261', fontSize: 14, letterSpacing: 1 }}>
      {'★'.repeat(puntos)}
      <Text style={{ color: t.borde }}>{'★'.repeat(5 - puntos)}</Text>
    </Text>
  );
}

export default function HistorialScreen() {
  const { usuario } = useAuth();
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [intercambios, setIntercambios] = useState<IntercambioCompletado[]>([]);
  const [cargando, setCargando]         = useState(true);

  useEffect(() => {
    if (usuario) cargar();
  }, [usuario]);

  async function cargar() {
    setCargando(true);
    const uid = usuario!.id;
    // Se incluyen los campos completado_* para filtrar client-side (patrón de perfil.tsx)
    const sel = 'id, solicitante_id, receptor_id, laminas_solicitadas, laminas_ofrecidas, created_at, completado_solicitante, completado_receptor';

    // Dos queries separadas, sin filtro booleano server-side — perfil.tsx usa el mismo patrón
    const [{ data: comoSol, error: e1 }, { data: comoRec, error: e2 }] = await Promise.all([
      supabase.from('solicitudes').select(sel)
        .eq('solicitante_id', uid)
        .order('created_at', { ascending: false }),
      supabase.from('solicitudes').select(sel)
        .eq('receptor_id', uid)
        .order('created_at', { ascending: false }),
    ]);

    if (e1 || e2) {
      console.error('Error historial:', e1?.message ?? e2?.message);
      setCargando(false);
      return;
    }

    // Filtro client-side: solo los que ambas partes confirmaron
    const solicitudesRaw = [...(comoSol ?? []), ...(comoRec ?? [])]
      .filter(s => s.completado_solicitante && s.completado_receptor)
      .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());

    if (solicitudesRaw.length === 0) {
      setIntercambios([]);
      setCargando(false);
      return;
    }

    const solicitudIds = solicitudesRaw.map(s => s.id);
    const otrosIds = [...new Set(
      solicitudesRaw.map(s => s.solicitante_id === uid ? s.receptor_id : s.solicitante_id)
    )];

    const [{ data: perfilesData }, { data: valoracionesData }] = await Promise.all([
      supabase.from('perfiles').select('usuario_id, nombre').in('usuario_id', otrosIds),
      supabase.from('valoraciones').select('solicitud_id, evaluador_id, puntos').in('solicitud_id', solicitudIds),
    ]);

    const pMap: Record<string, string> = {};
    for (const p of perfilesData ?? []) {
      pMap[p.usuario_id] = p.nombre ?? 'Coleccionista';
    }

    const valMap: Record<string, { miVal: number | null; suVal: number | null }> = {};
    for (const v of valoracionesData ?? []) {
      if (!valMap[v.solicitud_id]) valMap[v.solicitud_id] = { miVal: null, suVal: null };
      if (v.evaluador_id === uid) {
        valMap[v.solicitud_id].miVal = v.puntos as number;
      } else {
        valMap[v.solicitud_id].suVal = v.puntos as number;
      }
    }

    const nuevos: IntercambioCompletado[] = solicitudesRaw.map(s => {
      const esRecibida = s.receptor_id === uid;
      const otroId = esRecibida ? s.solicitante_id : s.receptor_id;
      const val = valMap[s.id] ?? { miVal: null, suVal: null };
      return {
        id: s.id,
        otroNombre: pMap[otroId] ?? 'Coleccionista',
        esRecibida,
        laminas_solicitadas: s.laminas_solicitadas as string[],
        laminas_ofrecidas: s.laminas_ofrecidas as string[],
        created_at: s.created_at as string,
        miCalificacion: val.miVal,
        suCalificacion: val.suVal,
      };
    });

    setIntercambios(nuevos);
    setCargando(false);
  }

  function renderItem({ item }: { item: IntercambioCompletado }) {
    return (
      <View style={styles.tarjeta}>
        <View style={styles.tarjetaHeader}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.otroNombre}>{item.otroNombre}</Text>
            <Text style={styles.fecha}>{formatFecha(item.created_at)}</Text>
          </View>
          <View style={styles.badgeCompletado}>
            <Text style={styles.badgeTexto}>✓ Completado</Text>
          </View>
        </View>

        <Text style={styles.secLabel}>{item.esRecibida ? 'Te pidieron' : 'Pediste'}</Text>
        <View style={styles.chipsWrap}>
          {item.laminas_solicitadas.map(cod => (
            <View key={cod} style={styles.chip}>
              <Text style={styles.chipTexto}>{cod}</Text>
            </View>
          ))}
        </View>

        {item.laminas_ofrecidas.length > 0 && (
          <>
            <Text style={styles.secLabel}>{item.esRecibida ? 'Te ofrecieron' : 'Ofreciste'}</Text>
            <View style={styles.chipsWrap}>
              {item.laminas_ofrecidas.map(cod => (
                <View key={cod} style={[styles.chip, styles.chipVerde]}>
                  <Text style={[styles.chipTexto, styles.chipTextoClaro]}>{cod}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {(item.miCalificacion !== null || item.suCalificacion !== null) && (
          <View style={styles.valoraciones}>
            {item.miCalificacion !== null && (
              <View style={styles.valFila}>
                <Text style={styles.valLabel}>Tu calificación: </Text>
                <Estrellas puntos={item.miCalificacion} t={t} />
              </View>
            )}
            {item.suCalificacion !== null && (
              <View style={styles.valFila}>
                <Text style={styles.valLabel}>Te calificaron: </Text>
                <Estrellas puntos={item.suCalificacion} t={t} />
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botonVolver}>
          <Text style={styles.botonVolverTexto}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Historial de intercambios</Text>
      </View>

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color="#e63946" />
        </View>
      ) : intercambios.length === 0 ? (
        <View style={styles.centrado}>
          <Text style={styles.textoVacio}>Aún no tienes intercambios completados.</Text>
          <Text style={styles.textoVacioSub}>
            Cuando ambas partes marquen un intercambio como completado, aparecerá aquí.
          </Text>
        </View>
      ) : (
        <FlatList
          data={intercambios}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          ListHeaderComponent={
            <Text style={styles.totalTexto}>
              {intercambios.length} intercambio{intercambios.length !== 1 ? 's' : ''} completado{intercambios.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}
    </View>
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
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botonVolver: {
    paddingRight: 4,
    paddingVertical: 2,
  },
  botonVolverTexto: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
  },
  headerTitulo: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
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
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  lista: {
    padding: 12,
    gap: 10,
    paddingBottom: 40,
  },
  totalTexto: {
    fontSize: 12,
    color: t.textoTer,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  tarjeta: {
    backgroundColor: t.tarjeta,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  tarjetaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  otroNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: t.texto,
  },
  fecha: {
    fontSize: 12,
    color: t.textoTer,
    marginTop: 2,
  },
  badgeCompletado: {
    backgroundColor: t.fondoVerde,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTexto: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2a9d8f',
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
  chipVerde: {
    backgroundColor: '#2a9d8f',
  },
  chipTexto: {
    fontSize: 12,
    color: t.textoSec,
    fontWeight: '600',
  },
  chipTextoClaro: {
    color: '#fff',
  },
  valoraciones: {
    borderTopWidth: 1,
    borderTopColor: t.sep,
    marginTop: 10,
    paddingTop: 8,
    gap: 5,
  },
  valFila: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valLabel: {
    fontSize: 12,
    color: t.textoSec,
  },
  });
}
