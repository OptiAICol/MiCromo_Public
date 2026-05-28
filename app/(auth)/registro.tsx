import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { CIUDADES_POR_DEPARTAMENTO, DEPARTAMENTOS } from '@/constants/ciudades';
import { useTheme, Tema } from '@/hooks/useTheme';

type Pais = { nombre: string; indicador: string; bandera: string };

const PAISES: Pais[] = [
  { nombre: 'Colombia',        indicador: '57',  bandera: '🇨🇴' },
  { nombre: 'Argentina',       indicador: '54',  bandera: '🇦🇷' },
  { nombre: 'Brasil',          indicador: '55',  bandera: '🇧🇷' },
  { nombre: 'Chile',           indicador: '56',  bandera: '🇨🇱' },
  { nombre: 'Ecuador',         indicador: '593', bandera: '🇪🇨' },
  { nombre: 'Uruguay',         indicador: '598', bandera: '🇺🇾' },
  { nombre: 'Paraguay',        indicador: '595', bandera: '🇵🇾' },
  { nombre: 'Bolivia',         indicador: '591', bandera: '🇧🇴' },
  { nombre: 'Perú',            indicador: '51',  bandera: '🇵🇪' },
  { nombre: 'Venezuela',       indicador: '58',  bandera: '🇻🇪' },
  { nombre: 'México',          indicador: '52',  bandera: '🇲🇽' },
  { nombre: 'Estados Unidos',  indicador: '1',   bandera: '🇺🇸' },
  { nombre: 'Canadá',          indicador: '1',   bandera: '🇨🇦' },
  { nombre: 'Costa Rica',      indicador: '506', bandera: '🇨🇷' },
  { nombre: 'Panamá',          indicador: '507', bandera: '🇵🇦' },
  { nombre: 'Honduras',        indicador: '504', bandera: '🇭🇳' },
  { nombre: 'Guatemala',       indicador: '502', bandera: '🇬🇹' },
  { nombre: 'El Salvador',     indicador: '503', bandera: '🇸🇻' },
  { nombre: 'Rep. Dominicana', indicador: '1',   bandera: '🇩🇴' },
  { nombre: 'Cuba',            indicador: '53',  bandera: '🇨🇺' },
  { nombre: 'España',          indicador: '34',  bandera: '🇪🇸' },
  { nombre: 'Portugal',        indicador: '351', bandera: '🇵🇹' },
  { nombre: 'Alemania',        indicador: '49',  bandera: '🇩🇪' },
  { nombre: 'Francia',         indicador: '33',  bandera: '🇫🇷' },
  { nombre: 'Reino Unido',     indicador: '44',  bandera: '🇬🇧' },
  { nombre: 'Italia',          indicador: '39',  bandera: '🇮🇹' },
  { nombre: 'Países Bajos',    indicador: '31',  bandera: '🇳🇱' },
  { nombre: 'Marruecos',       indicador: '212', bandera: '🇲🇦' },
  { nombre: 'Senegal',         indicador: '221', bandera: '🇸🇳' },
  { nombre: 'Nigeria',         indicador: '234', bandera: '🇳🇬' },
  { nombre: 'Japón',           indicador: '81',  bandera: '🇯🇵' },
  { nombre: 'Corea del Sur',   indicador: '82',  bandera: '🇰🇷' },
  { nombre: 'Australia',       indicador: '61',  bandera: '🇦🇺' },
  { nombre: 'Arabia Saudita',  indicador: '966', bandera: '🇸🇦' },
];


export default function RegistroScreen() {
  const { signUp } = useAuth();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [nombre, setNombre]           = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [departamento, setDepartamento] = useState('');
  const [municipio, setMunicipio]     = useState('');
  const [paisTel, setPaisTel]         = useState<Pais>(PAISES[0]);
  const [numero, setNumero]           = useState('');

  const [error, setError]     = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalDep, setModalDep]   = useState(false);
  const [modalMun, setModalMun]   = useState(false);
  const [modalPais, setModalPais] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const municipiosDisponibles = departamento ? CIUDADES_POR_DEPARTAMENTO[departamento] : [];

  function scrollAlFinal() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  const handleRegistro = async () => {
    if (!nombre.trim() || !email.trim() || !password) {
      setError('Completa nombre, correo y contraseña.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setError(null);
    setMensaje(null);
    setLoading(true);

    const { error: errAuth, confirmarCorreo, userId } = await signUp(email.trim(), password, nombre.trim());

    if (errAuth) {
      setLoading(false);
      setError(errAuth);
      return;
    }

    if (userId) {
      const ciudadGuardada   = municipio && departamento ? `${municipio}, ${departamento}` : null;
      const whatsappCompleto = numero.trim() ? `${paisTel.indicador}${numero.trim()}` : null;

      await supabase.from('perfiles')
        .update({ nombre: nombre.trim(), ciudad: ciudadGuardada, whatsapp: whatsappCompleto })
        .eq('usuario_id', userId);
    }

    setLoading(false);

    if (confirmarCorreo) {
      setMensaje('Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContenido}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.titulo}>MiCromo</Text>
          <Text style={styles.subtitulo}>Crea tu cuenta</Text>

          {/* Datos de acceso */}
          <TextInput
            style={styles.input}
            placeholder="Tu nombre"
            placeholderTextColor="#aaa"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
          />
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
            placeholder="Contraseña (mínimo 6 caracteres)"
            placeholderTextColor="#aaa"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Ubicación */}
          <View style={styles.seccionDivider}>
            <View style={styles.lineaDivider} />
            <Text style={styles.textoDivider}>Ubicación (opcional)</Text>
            <View style={styles.lineaDivider} />
          </View>

          <TouchableOpacity style={styles.selector} onPress={() => setModalDep(true)}>
            <Text style={departamento ? styles.valorSeleccionado : styles.placeholder}>
              {departamento || 'Departamento'}
            </Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.selector, !departamento && styles.selectorDeshabilitado]}
            onPress={() => departamento && setModalMun(true)}
            activeOpacity={departamento ? 0.7 : 1}
          >
            <Text style={municipio ? styles.valorSeleccionado : styles.placeholder}>
              {municipio || (departamento ? 'Municipio' : 'Primero elige un departamento')}
            </Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>

          {/* Teléfono */}
          <View style={styles.seccionDivider}>
            <View style={styles.lineaDivider} />
            <Text style={styles.textoDivider}>WhatsApp (opcional)</Text>
            <View style={styles.lineaDivider} />
          </View>

          <View style={styles.filaPhone}>
            <TouchableOpacity style={styles.selectorPais} onPress={() => { scrollAlFinal(); setModalPais(true); }} activeOpacity={0.7}>
              <Text style={styles.bandera}>{paisTel.bandera}</Text>
              <Text style={styles.indicadorTexto}>+{paisTel.indicador}</Text>
              <Text style={styles.chevron}>▼</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.inputNumero}
              placeholder="Número de teléfono"
              placeholderTextColor="#aaa"
              value={numero}
              onChangeText={v => setNumero(v.replace(/[^0-9]/g, ''))}
              onFocus={scrollAlFinal}
              keyboardType="phone-pad"
              maxLength={12}
            />
          </View>
          {numero.length > 0 && (
            <Text style={styles.ayuda}>
              Se guardará como: {paisTel.indicador}{numero}
            </Text>
          )}

          {error   !== null && <Text style={styles.error}>{error}</Text>}
          {mensaje !== null && <Text style={styles.exito}>{mensaje}</Text>}

          <Pressable
            style={[styles.boton, loading && styles.botonDeshabilitado]}
            onPress={handleRegistro}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.botonTexto}>Crear cuenta</Text>}
          </Pressable>

          <View style={styles.filaPrivacidad}>
            <Text style={styles.textoPrivacidad}>Al registrarte aceptas la </Text>
            <Link href="/privacidad" style={styles.linkPrivacidad}>Política de Privacidad</Link>
          </View>

          <Link href="/(auth)/login" style={styles.link}>
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </View>
      </ScrollView>

      {/* Modal departamentos */}
      <ModalLista
        visible={modalDep}
        titulo="Selecciona tu departamento"
        items={DEPARTAMENTOS}
        seleccionado={departamento}
        onSeleccionar={dep => { setDepartamento(dep); setMunicipio(''); setModalDep(false); }}
        onCerrar={() => setModalDep(false)}
      />

      {/* Modal municipios */}
      <ModalLista
        visible={modalMun}
        titulo={`Municipios de ${departamento}`}
        items={municipiosDisponibles}
        seleccionado={municipio}
        onSeleccionar={mun => { setMunicipio(mun); setModalMun(false); }}
        onCerrar={() => setModalMun(false)}
      />

      {/* Modal indicativo de país */}
      <Modal
        visible={modalPais}
        animationType="slide"
        transparent
        onRequestClose={() => setModalPais(false)}
      >
        <TouchableOpacity style={styles.modalFondo} activeOpacity={1} onPress={() => setModalPais(false)}>
          <View style={styles.modalContenido}>
            <View style={styles.modalEncabezado}>
              <Text style={styles.modalTitulo}>Indicativo de país</Text>
              <TouchableOpacity onPress={() => setModalPais(false)}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={PAISES}
              keyExtractor={item => item.nombre}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.itemLista, paisTel.nombre === item.nombre && styles.itemListaActivo]}
                  onPress={() => { setPaisTel(item); setModalPais(false); }}
                >
                  <Text style={styles.itemBandera}>{item.bandera}</Text>
                  <Text style={[
                    styles.itemListaTexto,
                    paisTel.nombre === item.nombre && styles.itemListaTextoActivo,
                  ]}>
                    {item.nombre}
                  </Text>
                  <Text style={styles.itemIndicador}>+{item.indicador}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

interface ModalListaProps {
  visible: boolean;
  titulo: string;
  items: string[];
  seleccionado: string;
  onSeleccionar: (item: string) => void;
  onCerrar: () => void;
}

function ModalLista({ visible, titulo, items, seleccionado, onSeleccionar, onCerrar }: ModalListaProps) {
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <TouchableOpacity style={styles.modalFondo} activeOpacity={1} onPress={onCerrar}>
        <View style={styles.modalContenido}>
          <View style={styles.modalEncabezado}>
            <Text style={styles.modalTitulo}>{titulo}</Text>
            <TouchableOpacity onPress={onCerrar}>
              <Text style={styles.modalCerrar}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.itemLista, seleccionado === item && styles.itemListaActivo]}
                onPress={() => onSeleccionar(item)}
              >
                <Text style={[
                  styles.itemListaTexto,
                  seleccionado === item && styles.itemListaTextoActivo,
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.fondo,
  },
  scrollContenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
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
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: t.texto,
    marginBottom: 12,
    backgroundColor: t.input,
  },
  seccionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 8,
  },
  lineaDivider: {
    flex: 1,
    height: 1,
    backgroundColor: t.borde,
  },
  textoDivider: {
    fontSize: 12,
    color: t.textoDes,
    fontWeight: '600',
  },
  selector: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: t.input,
    marginBottom: 12,
  },
  selectorDeshabilitado: {
    backgroundColor: t.alt,
    borderColor: t.borde,
  },
  valorSeleccionado: {
    fontSize: 16,
    color: t.texto,
    flex: 1,
  },
  placeholder: {
    fontSize: 16,
    color: t.textoDes,
    flex: 1,
  },
  chevron: {
    color: t.textoDes,
    fontSize: 11,
    marginLeft: 6,
  },
  filaPhone: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  selectorPais: {
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.input,
    gap: 4,
  },
  bandera: {
    fontSize: 20,
  },
  indicadorTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: t.texto,
  },
  inputNumero: {
    flex: 1,
    borderWidth: 1,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: t.texto,
    backgroundColor: t.input,
  },
  ayuda: {
    fontSize: 12,
    color: t.textoDes,
    marginBottom: 4,
    marginLeft: 2,
  },
  error: {
    color: '#e63946',
    fontSize: 14,
    marginVertical: 10,
    textAlign: 'center',
  },
  exito: {
    color: '#2a9d8f',
    fontSize: 14,
    marginVertical: 10,
    textAlign: 'center',
  },
  boton: {
    backgroundColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
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
  filaPrivacidad: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  textoPrivacidad: {
    fontSize: 12,
    color: t.textoDes,
  },
  linkPrivacidad: {
    fontSize: 12,
    color: '#e63946',
    textDecorationLine: 'underline',
  },
  // Modal compartido
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
  modalEncabezado: {
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
    flex: 1,
    marginRight: 8,
  },
  modalCerrar: {
    fontSize: 18,
    color: t.textoTer,
    paddingHorizontal: 4,
  },
  itemLista: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: t.sep,
  },
  itemListaActivo: {
    backgroundColor: t.fondoRojo,
  },
  itemBandera: {
    fontSize: 20,
    marginRight: 12,
  },
  itemListaTexto: {
    fontSize: 16,
    color: t.textoSec,
    flex: 1,
  },
  itemListaTextoActivo: {
    color: '#e63946',
    fontWeight: '700',
  },
  itemIndicador: {
    fontSize: 14,
    color: t.textoTer,
    fontWeight: '600',
    marginLeft: 8,
  },
  });
}
