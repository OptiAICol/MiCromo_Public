import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, Tema } from '@/hooks/useTheme';

export default function PrivacidadScreen() {
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  return (
    <View style={styles.contenedor}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnBack}>
          <Text style={styles.btnBackTexto}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Política de Privacidad</Text>
      </View>

      <ScrollView contentContainerStyle={styles.cuerpo} showsVerticalScrollIndicator={false}>
        <Text style={styles.actualizacion}>Última actualización: mayo de 2026</Text>

        <Seccion titulo="1. ¿Quiénes somos?" corpo={
          'MiCromo es una aplicación desarrollada por OptiAI (Medellín, Colombia) para ' +
          'coleccionistas del álbum Panini del Mundial 2026.\n\n' +
          'Contacto del responsable: optiai.com.co@gmail.com'
        } />

        <Seccion titulo="2. Información que recopilamos" corpo={
          'Al registrarte recopilamos:\n' +
          '• Correo electrónico (autenticación)\n' +
          '• Nombre de usuario\n' +
          '• Ciudad de residencia\n' +
          '• Número de WhatsApp (opcional)\n' +
          '• Estado de tus láminas (tenidas, repetidas, faltantes)'
        } />

        <Seccion titulo="3. Uso de la información" corpo={
          'Usamos tu información para:\n' +
          '• Gestionar tu colección de láminas\n' +
          '• Publicar y mostrar ofertas de intercambio y anuncios de venta\n' +
          '• Conectarte con otros coleccionistas en tu ciudad\n' +
          '• Enviarte notificaciones push sobre tu actividad en la app'
        } />

        <Seccion titulo="4. Visibilidad de tus datos" corpo={
          'Tu nombre y ciudad son visibles para otros usuarios del tablón.\n\n' +
          'Tu número de WhatsApp nunca se muestra públicamente. Solo se comparte ' +
          'con una persona específica cuando tú aceptas expresamente su solicitud ' +
          'de contacto en un anuncio de venta.'
        } />

        <Seccion titulo="5. Notificaciones push" corpo={
          'Con tu permiso enviamos notificaciones sobre solicitudes de intercambio, ' +
          'respuestas a tus anuncios y confirmaciones de intercambio.\n\n' +
          'Puedes desactivarlas en cualquier momento desde la configuración de notificaciones de tu dispositivo.'
        } />

        <Seccion titulo="6. Almacenamiento de datos" corpo={
          'Tus datos se almacenan en Supabase (supabase.com), un servicio de base de ' +
          'datos en la nube. Los servidores pueden estar ubicados fuera de Colombia.\n\n' +
          'Aplicamos Row Level Security (RLS) para que cada usuario solo pueda acceder ' +
          'a sus propios datos.'
        } />

        <Seccion titulo="7. No compartimos tus datos" corpo={
          'No vendemos, arrendamos ni compartimos tu información personal con terceros ' +
          'con fines comerciales o publicitarios.'
        } />

        <Seccion titulo="8. Retención y eliminación" corpo={
          'Conservamos tu información mientras mantengas una cuenta activa en MiCromo.\n\n' +
          'Puedes solicitar la eliminación de tu cuenta y todos tus datos escribiéndonos a: ' +
          'optiai.com.co@gmail.com'
        } />

        <Seccion titulo="9. Tus derechos" corpo={
          'Tienes derecho a acceder, corregir o eliminar tu información personal en ' +
          'cualquier momento. Para ejercer estos derechos contáctanos por correo electrónico.'
        } />

        <Seccion titulo="10. Cambios a esta política" corpo={
          'Podemos actualizar esta política ocasionalmente. Te informaremos sobre cambios ' +
          'relevantes a través de la aplicación.'
        } />

        <View style={styles.footer}>
          <Text style={styles.footerTexto}>MiCromo · OptiAI · Medellín, Colombia</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Seccion({ titulo, corpo }: { titulo: string; corpo: string }) {
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      <Text style={styles.seccionTexto}>{corpo}</Text>
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
      paddingBottom: 16,
      paddingHorizontal: 20,
    },
    btnBack: {
      marginBottom: 8,
    },
    btnBackTexto: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 14,
    },
    titulo: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#fff',
    },
    cuerpo: {
      padding: 20,
      paddingBottom: 48,
    },
    actualizacion: {
      fontSize: 12,
      color: t.textoDes,
      marginBottom: 20,
      fontStyle: 'italic',
    },
    seccion: {
      marginBottom: 22,
    },
    seccionTitulo: {
      fontSize: 15,
      fontWeight: '700',
      color: t.texto,
      marginBottom: 6,
    },
    seccionTexto: {
      fontSize: 14,
      color: t.textoSec,
      lineHeight: 22,
    },
    footer: {
      marginTop: 20,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: t.sep,
      alignItems: 'center',
    },
    footerTexto: {
      fontSize: 12,
      color: t.textoDes,
    },
  });
}
