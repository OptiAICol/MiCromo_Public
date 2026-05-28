import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, Tema } from '@/hooks/useTheme';

interface Props {
  visible: boolean;
  onCerrar: () => void;
  nombreInicial?: string;
}

export default function ModalReporte({ visible, onCerrar, nombreInicial = '' }: Props) {
  const { usuario } = useAuth();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [nombre, setNombre]   = useState(nombreInicial);
  const [telefono, setTelefono] = useState('');
  const [motivo, setMotivo]   = useState('');
  const [enviando, setEnviando] = useState(false);

  function resetear() {
    setNombre(nombreInicial);
    setTelefono('');
    setMotivo('');
  }

  function cerrar() {
    resetear();
    onCerrar();
  }

  async function enviar() {
    if (!nombre.trim() && !telefono.trim()) {
      Alert.alert('Falta información', 'Indica al menos el nombre o el teléfono del usuario que quieres reportar.');
      return;
    }
    if (!motivo.trim()) {
      Alert.alert('Falta información', 'Describe el motivo del reporte.');
      return;
    }

    setEnviando(true);
    const { error } = await supabase.from('reportes').insert({
      reporter_id:        usuario?.id ?? null,
      nombre_reportado:   nombre.trim(),
      telefono_reportado: telefono.trim() || null,
      motivo:             motivo.trim(),
    });
    setEnviando(false);

    if (error) {
      Alert.alert('Error al enviar', error.message);
    } else {
      Alert.alert(
        'Reporte enviado',
        'Gracias por ayudarnos a mantener la comunidad segura. Revisaremos tu reporte.',
        [{ text: 'OK', onPress: cerrar }],
      );
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cerrar}>
      <TouchableOpacity style={styles.fondo} activeOpacity={1} onPress={cerrar}>
        <TouchableOpacity style={styles.contenido} activeOpacity={1}>
          {/* Encabezado */}
          <View style={styles.encabezado}>
            <View style={styles.encabezadoIzq}>
              <Text style={styles.icono}>⚠</Text>
              <Text style={styles.titulo}>Reportar usuario</Text>
            </View>
            <TouchableOpacity onPress={cerrar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.cerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.aviso}>
            Tu reporte es confidencial. Lo revisaremos para mantener la comunidad segura.
          </Text>

          <Text style={styles.etiqueta}>Nombre del usuario <Text style={styles.opcional}>(al menos uno requerido)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre o apodo del usuario"
            placeholderTextColor={t.textoDes}
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
          />

          <Text style={styles.etiqueta}>Teléfono / WhatsApp <Text style={styles.opcional}>(al menos uno requerido)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 573001234567"
            placeholderTextColor={t.textoDes}
            value={telefono}
            onChangeText={v => setTelefono(v.replace(/[^0-9+]/g, ''))}
            keyboardType="phone-pad"
          />

          <Text style={styles.etiqueta}>¿Por qué lo reportas? *</Text>
          <TextInput
            style={[styles.input, styles.inputMotivo]}
            placeholder="Describe lo que ocurrió..."
            placeholderTextColor={t.textoDes}
            value={motivo}
            onChangeText={setMotivo}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          {motivo.length > 0 && (
            <Text style={styles.contador}>{motivo.length}/500</Text>
          )}

          <TouchableOpacity
            style={[styles.boton, enviando && styles.botonDes]}
            onPress={enviar}
            disabled={enviando}
            activeOpacity={0.85}
          >
            {enviando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.botonTexto}>Enviar reporte</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
    fondo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    contenido: {
      backgroundColor: t.tarjeta,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    encabezado: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    encabezadoIzq: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    icono: {
      fontSize: 20,
    },
    titulo: {
      fontSize: 17,
      fontWeight: '700',
      color: t.texto,
    },
    cerrar: {
      fontSize: 18,
      color: t.textoTer,
      paddingHorizontal: 4,
    },
    aviso: {
      fontSize: 13,
      color: t.textoSec,
      marginBottom: 16,
      lineHeight: 18,
      backgroundColor: t.fondoNaranja,
      padding: 10,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: '#f4a261',
    },
    etiqueta: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textoSec,
      marginBottom: 6,
    },
    opcional: {
      fontWeight: '400',
      color: t.textoDes,
    },
    input: {
      borderWidth: 1,
      borderColor: t.bordeInput,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: t.texto,
      backgroundColor: t.input,
      marginBottom: 14,
    },
    inputMotivo: {
      minHeight: 80,
      marginBottom: 4,
    },
    contador: {
      fontSize: 11,
      color: t.textoDes,
      textAlign: 'right',
      marginBottom: 14,
    },
    boton: {
      backgroundColor: '#e63946',
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    botonDes: {
      opacity: 0.6,
    },
    botonTexto: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
