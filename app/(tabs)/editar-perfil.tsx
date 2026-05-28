import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { CIUDADES_POR_DEPARTAMENTO, DEPARTAMENTOS } from '@/constants/ciudades';
import { useTheme, Tema } from '@/hooks/useTheme';

interface FormularioPerfil {
  nombre: string;
  departamento: string;
  municipio: string;
  whatsapp: string;
}

// Parsea "Municipio, Departamento" al cargar el perfil guardado
function parsearCiudad(ciudad: string | null): { departamento: string; municipio: string } {
  if (!ciudad) return { departamento: '', municipio: '' };
  const idx = ciudad.lastIndexOf(', ');
  if (idx === -1) return { departamento: '', municipio: '' };
  const dep = ciudad.slice(idx + 2);
  const mun = ciudad.slice(0, idx);
  const municipiosDelDep = CIUDADES_POR_DEPARTAMENTO[dep];
  if (!municipiosDelDep || !municipiosDelDep.includes(mun)) {
    return { departamento: '', municipio: '' };
  }
  return { departamento: dep, municipio: mun };
}

export default function EditarPerfilScreen() {
  const { usuario } = useAuth();
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);
  const [form, setForm] = useState<FormularioPerfil>({
    nombre: '',
    departamento: '',
    municipio: '',
    whatsapp: '',
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modalDep, setModalDep] = useState(false);
  const [modalMun, setModalMun] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    cargarPerfil();
  }, [usuario]);

  async function cargarPerfil() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('nombre, ciudad, whatsapp')
      .eq('usuario_id', usuario!.id)
      .single();

    if (!error && data) {
      const { departamento, municipio } = parsearCiudad(data.ciudad);
      setForm({
        nombre: data.nombre ?? '',
        departamento,
        municipio,
        whatsapp: data.whatsapp ?? '',
      });
    }
    setCargando(false);
  }

  function seleccionarDepartamento(dep: string) {
    // Al cambiar departamento se limpia el municipio
    setForm((f) => ({ ...f, departamento: dep, municipio: '' }));
    setModalDep(false);
  }

  function seleccionarMunicipio(mun: string) {
    setForm((f) => ({ ...f, municipio: mun }));
    setModalMun(false);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) {
      Alert.alert('Error', 'El nombre no puede estar vacío.');
      return;
    }

    // Construye el valor "Municipio, Departamento" o null si está incompleto
    const ciudadGuardada =
      form.municipio && form.departamento
        ? `${form.municipio}, ${form.departamento}`
        : null;

    setGuardando(true);
    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre: form.nombre.trim(),
        ciudad: ciudadGuardada,
        whatsapp: form.whatsapp.trim() || null,
      })
      .eq('usuario_id', usuario!.id);

    setGuardando(false);

    if (error) {
      Alert.alert('Error', 'No se pudo guardar el perfil. Intenta de nuevo.');
    } else {
      Alert.alert('Listo', 'Perfil actualizado correctamente.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/perfil') },
      ]);
    }
  }

  const municipiosDisponibles = form.departamento
    ? CIUDADES_POR_DEPARTAMENTO[form.departamento]
    : [];

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.botonVolver}>
          <Text style={styles.botonVolverTexto}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.titulo}>Editar perfil</Text>

        {/* Nombre */}
        <Text style={styles.etiqueta}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={form.nombre}
          onChangeText={(v) => setForm({ ...form, nombre: v })}
          placeholder="Tu nombre completo"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
          returnKeyType="next"
        />

        {/* Departamento */}
        <Text style={styles.etiqueta}>Departamento</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setModalDep(true)}>
          <Text style={form.departamento ? styles.valorSeleccionado : styles.placeholder}>
            {form.departamento || 'Selecciona tu departamento'}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>

        {/* Municipio */}
        <Text style={styles.etiqueta}>Municipio</Text>
        <TouchableOpacity
          style={[styles.selector, !form.departamento && styles.selectorDeshabilitado]}
          onPress={() => form.departamento && setModalMun(true)}
          activeOpacity={form.departamento ? 0.7 : 1}
        >
          <Text style={form.municipio ? styles.valorSeleccionado : styles.placeholder}>
            {form.municipio || (form.departamento ? 'Selecciona tu municipio' : 'Primero elige un departamento')}
          </Text>
          <Text style={styles.chevron}>▼</Text>
        </TouchableOpacity>

        {/* WhatsApp */}
        <Text style={styles.etiqueta}>WhatsApp</Text>
        <TextInput
          style={styles.input}
          value={form.whatsapp}
          onChangeText={(v) => setForm({ ...form, whatsapp: v.replace(/[^0-9]/g, '') })}
          placeholder="573001234567"
          placeholderTextColor="#aaa"
          keyboardType="phone-pad"
          returnKeyType="done"
          maxLength={15}
        />
        <Text style={styles.ayuda}>Incluye el código de país (57 para Colombia)</Text>

        {/* Botón guardar */}
        <TouchableOpacity
          style={[styles.botonGuardar, guardando && styles.botonDeshabilitado]}
          onPress={handleGuardar}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botonGuardarTexto}>Guardar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de departamentos */}
      <ModalLista
        visible={modalDep}
        titulo="Selecciona tu departamento"
        items={DEPARTAMENTOS}
        seleccionado={form.departamento}
        onSeleccionar={seleccionarDepartamento}
        onCerrar={() => setModalDep(false)}
      />

      {/* Modal de municipios */}
      <ModalLista
        visible={modalMun}
        titulo={`Municipios de ${form.departamento}`}
        items={municipiosDisponibles}
        seleccionado={form.municipio}
        onSeleccionar={seleccionarMunicipio}
        onCerrar={() => setModalMun(false)}
      />
    </KeyboardAvoidingView>
  );
}

// Componente reutilizable para los modales de selección
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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCerrar}
    >
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
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.itemLista, seleccionado === item && styles.itemListaActivo]}
                onPress={() => onSeleccionar(item)}
              >
                <Text
                  style={[
                    styles.itemListaTexto,
                    seleccionado === item && styles.itemListaTextoActivo,
                  ]}
                >
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
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  botonVolver: {
    marginBottom: 16,
  },
  botonVolverTexto: {
    color: '#e63946',
    fontSize: 16,
    fontWeight: '600',
  },
  titulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e63946',
    marginBottom: 28,
  },
  etiqueta: {
    fontSize: 14,
    fontWeight: '600',
    color: t.textoSec,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1.5,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: t.texto,
    backgroundColor: t.input,
  },
  selector: {
    borderWidth: 1.5,
    borderColor: t.bordeInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: t.input,
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
    color: t.textoTer,
    fontSize: 12,
    marginLeft: 8,
  },
  ayuda: {
    fontSize: 12,
    color: t.textoDes,
    marginTop: 4,
  },
  botonGuardar: {
    backgroundColor: '#e63946',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 36,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  botonGuardarTexto: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  // Modal
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
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: t.sep,
  },
  itemListaActivo: {
    backgroundColor: t.fondoRojo,
  },
  itemListaTexto: {
    fontSize: 16,
    color: t.textoSec,
  },
  itemListaTextoActivo: {
    color: '#e63946',
    fontWeight: '700',
  },
  });
}
