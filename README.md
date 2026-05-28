# MiCromo — Marketplace de láminas Panini

App móvil para Android desarrollada con **React Native + Expo** que permite a coleccionistas de álbumes Panini gestionar sus láminas e intercambiarlas con otros usuarios.

---

## Descargar e instalar la app (Android)

> Esta es la versión funcional del proyecto, conectada al servidor de producción.

**[Descargar APK desde Google Drive](https://drive.google.com/drive/folders/1uqv_gmYa7DjyDTyMrG0_JS9HaPivDstC?usp=sharing)**

### Pasos para instalar en Android

1. **Descarga el archivo `.apk`** desde el enlace de arriba
2. **Abre el archivo** desde la carpeta de Descargas de tu celular
3. Si Android muestra el mensaje *"Aplicación bloqueada"* o *"Fuentes desconocidas"*:
   - Toca **Configuración** en el aviso
   - Activa **Permitir desde esta fuente**
   - Regresa e intenta instalar de nuevo
4. Toca **Instalar** y espera que termine
5. Toca **Abrir** — ya puedes registrarte y usar la app

> **Nota:** Este mensaje de seguridad es normal en apps instaladas fuera de Google Play. El APK es seguro.

Publicada originalmente para el álbum del **Mundial FIFA 2026** en Colombia. El código es completamente reutilizable para cualquier álbum de láminas o colección similar.

---

## Funcionalidades

- **Mi Álbum** — 980 chips interactivos organizados por equipo. Marca láminas como tenida, repetida o faltante
- **Mercado** — Matching bidireccional automático: ve quién tiene lo que te falta y necesita lo que te sobra. Filtro por ciudad y departamento
- **Anuncios** — Tablón de venta de láminas con precio. Búsqueda por código de lámina
- **Intercambios** — Envía solicitudes con propuesta personalizada, acepta o rechaza, completa el intercambio y valora al otro usuario
- **Historial** — Registro de todos los intercambios completados con calificaciones
- **Notificaciones push** — Alertas en tiempo real para solicitudes, aceptaciones y confirmaciones
- **Modo oscuro** — Toggle persistido, paleta completa en todos los screens
- **Moderación** — Reporte de usuarios desde cualquier pantalla

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | React Native + Expo SDK 54 |
| Lenguaje | TypeScript estricto |
| Navegación | Expo Router (file-based) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Push notifications | Expo Push Service + Firebase FCM v1 |
| Build | EAS Build (Expo Application Services) |

---

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- [EAS CLI](https://docs.expo.dev/build/setup/): `npm install -g eas-cli`
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [Expo](https://expo.dev) (gratuita)
- Cuenta en [Firebase](https://console.firebase.google.com) (gratuita, para push notifications)
- Java 17 y Android SDK si quieres hacer builds locales

---

## Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/TU_USUARIO/TU_REPO.git
cd TU_REPO
```

### 2. Instala las dependencias

```bash
npx expo install
```

> Usa siempre `npx expo install` para instalar paquetes — garantiza compatibilidad con la versión de Expo SDK.

### 3. Configura las variables de entorno

Copia el archivo de ejemplo y rellena con tus credenciales de Supabase:

```bash
cp .env.example .env
```

Edita `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Encuentra estos valores en tu proyecto de Supabase → **Settings → API**.

### 4. Configura Supabase

En el **SQL Editor** de tu proyecto Supabase, ejecuta las siguientes sentencias para crear el esquema:

```sql
-- Tabla de perfiles de usuario
CREATE TABLE perfiles (
  usuario_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT DEFAULT '',
  ciudad TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  expo_push_token TEXT
);

-- Tabla de láminas por usuario
CREATE TABLE laminas_usuario (
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_lamina TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('tenida', 'repetida', 'faltante')),
  cantidad INT DEFAULT 1,
  UNIQUE(usuario_id, numero_lamina)
);

-- Tabla de ofertas de intercambio
CREATE TABLE ofertas_intercambio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  laminas_ofrezco TEXT[] DEFAULT '{}',
  laminas_busco TEXT[] DEFAULT '{}',
  busco_cualquier_faltante BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id)
);

-- Tabla de solicitudes de intercambio
CREATE TABLE solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receptor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  laminas_solicitadas TEXT[] DEFAULT '{}',
  laminas_ofrecidas TEXT[] DEFAULT '{}',
  nota TEXT DEFAULT '',
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  completado_solicitante BOOLEAN DEFAULT false,
  completado_receptor BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de anuncios de venta
CREATE TABLE anuncios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  laminas TEXT[] DEFAULT '{}',
  descripcion TEXT DEFAULT '',
  precio NUMERIC DEFAULT 0,
  destacado BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de valoraciones
CREATE TABLE valoraciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluador_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluado_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitud_id UUID REFERENCES solicitudes(id) ON DELETE CASCADE,
  puntos INT CHECK (puntos BETWEEN 1 AND 5),
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(evaluador_id, solicitud_id)
);

-- Tabla de contactos de anuncio
CREATE TABLE contactos_anuncio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anuncio_id UUID REFERENCES anuncios(id) ON DELETE CASCADE,
  comprador_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vendedor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mensaje TEXT DEFAULT '',
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de reportes de usuarios
CREATE TABLE reportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre_reportado TEXT,
  telefono_reportado TEXT,
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Trigger para crear perfil automáticamente al registrarse:**

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.perfiles (usuario_id, nombre, ciudad, whatsapp)
  VALUES (new.id, '', '', '');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**RPC para proteger el WhatsApp del vendedor:**

```sql
CREATE OR REPLACE FUNCTION get_whatsapp_vendedores_aceptados(vendedor_ids UUID[])
RETURNS TABLE(usuario_id UUID, whatsapp TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT p.usuario_id, p.whatsapp
  FROM perfiles p
  WHERE p.usuario_id = ANY(vendedor_ids)
    AND EXISTS (
      SELECT 1 FROM contactos_anuncio ca
      WHERE ca.vendedor_id = p.usuario_id
        AND ca.comprador_id = auth.uid()
        AND ca.estado = 'aceptada'
    );
END;
$$;
```

**Habilita RLS en todas las tablas** (Database → Table Editor → cada tabla → Enable RLS) y crea las políticas correspondientes para cada tabla.

**Habilita Realtime** para `solicitudes` y `contactos_anuncio`:
Database → Replication → supabase_realtime → añadir ambas tablas.

**Configura el deep link de recuperación de contraseña:**
Authentication → URL Configuration → Redirect URLs → agregar `micromo://reset-password`

### 5. Configura Firebase (notificaciones push)

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Agrega una app Android con el package ID que uses
3. Descarga `google-services.json` y reemplaza el del proyecto
4. Genera una Service Account Key para FCM v1:
   Firebase → Configuración del proyecto → Cuentas de servicio → Generar clave privada
5. Sube la credencial a EAS: `eas credentials`

### 6. Configura EAS Build

Edita `app.json` con tus datos:
- `android.package` → tu package ID (ej: `com.tuempresa.tunombreapp`)
- `extra.eas.projectId` → tu project ID de Expo (obtenlo con `eas init`)
- `owner` → tu usuario de Expo

Edita `eas.json` reemplazando `TU_SUPABASE_URL` y `TU_SUPABASE_ANON_KEY` con tus valores reales.

Para generar un APK de prueba:
```bash
eas build --local --profile preview --platform android
```

---

## Estructura del proyecto

```
/app
  /(auth)/        login, registro, recuperar contraseña
  /(tabs)/        Mercado, Mi Álbum, Anuncios, Perfil
  solicitud.tsx   enviar solicitud de intercambio
  historial.tsx   historial de intercambios
  privacidad.tsx  política de privacidad
  reset-password.tsx

/components
  ModalReporte.tsx  reporte de usuarios
  ErrorRed.tsx      pantalla de error de red

/constants
  laminas.ts    49 secciones, 980 láminas del Mundial 2026
  ciudades.ts   departamentos y municipios de Colombia

/hooks
  useAuth.ts    sesión de usuario
  useTheme.tsx  modo oscuro + sistema de temas

/lib
  supabase.ts         cliente Supabase
  notificaciones.ts   registro y envío de push notifications
```

---

## Adaptación para otro álbum

Para usar este proyecto con un álbum diferente al Mundial 2026:

1. Edita `constants/laminas.ts` — reemplaza las secciones y códigos de láminas
2. Cambia `TOTAL_LAMINAS` por el total de tu álbum
3. Ajusta los textos de UI en los screens (referencias al "Mundial", "FIFA", etc.)
4. Opcionalmente edita `constants/ciudades.ts` si tu público objetivo no es Colombia

---

## Notas importantes

- **Faltantes** se calculan siempre como `TODOS_LOS_CODIGOS − (tenidas ∪ repetidas)`. Nunca se almacenan en la base de datos
- **WhatsApp** del vendedor solo es visible después de que este acepta el contacto — protegido por una función RPC con SECURITY DEFINER
- **expo-notifications** requiere un build nativo (APK/AAB). No funciona en Expo Go
- Usar siempre `npx expo install` para agregar paquetes nuevos

---

## Licencia

MIT — libre para uso académico, personal y comercial. Si lo usas como base para tu proyecto, se agradece mencionar la fuente.

---

Desarrollado por **Victor — OptiAI, Medellín, Colombia** como proyecto pedagógico.
