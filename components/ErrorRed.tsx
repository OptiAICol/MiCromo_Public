import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, Tema } from '@/hooks/useTheme';

type Props = {
  onReintentar: () => void;
  mensaje?: string;
};

export default function ErrorRed({ onReintentar, mensaje }: Props) {
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  return (
    <View style={styles.contenedor}>
      <Text style={styles.icono}>📡</Text>
      <Text style={styles.titulo}>Sin conexión</Text>
      <Text style={styles.texto}>
        {mensaje ?? 'No se pudo cargar la información.\nVerifica tu conexión a internet.'}
      </Text>
      <TouchableOpacity style={styles.boton} onPress={onReintentar} activeOpacity={0.8}>
        <Text style={styles.botonTexto}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
    contenedor: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      backgroundColor: t.fondo,
    },
    icono: {
      fontSize: 48,
      marginBottom: 16,
    },
    titulo: {
      fontSize: 20,
      fontWeight: '700',
      color: t.texto,
      marginBottom: 10,
    },
    texto: {
      fontSize: 14,
      color: t.textoSec,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 28,
    },
    boton: {
      backgroundColor: '#e63946',
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 36,
    },
    botonTexto: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
