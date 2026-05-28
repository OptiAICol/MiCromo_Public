import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Tema {
  fondo:        string;
  tarjeta:      string;
  input:        string;
  alt:          string;
  texto:        string;
  textoSec:     string;
  textoTer:     string;
  textoDes:     string;
  borde:        string;
  bordeInput:   string;
  sep:          string;
  fondoRojo:    string;
  fondoVerde:   string;
  fondoAzul:    string;
  fondoNaranja: string;
  fondoIndigo:  string;
  oscuro:       boolean;
}

const CLARO: Tema = {
  fondo:        '#f5f5f5',
  tarjeta:      '#ffffff',
  input:        '#fafafa',
  alt:          '#f0f0f0',
  texto:        '#222222',
  textoSec:     '#555555',
  textoTer:     '#888888',
  textoDes:     '#aaaaaa',
  borde:        '#e0e0e0',
  bordeInput:   '#dddddd',
  sep:          '#ececec',
  fondoRojo:    '#fef0f1',
  fondoVerde:   '#edf7f6',
  fondoAzul:    '#eef4fb',
  fondoNaranja: '#fff8e1',
  fondoIndigo:  '#eef2ff',
  oscuro:       false,
};

const OSCURO: Tema = {
  fondo:        '#111111',
  tarjeta:      '#1e1e1e',
  input:        '#252525',
  alt:          '#2a2a2a',
  texto:        '#f0f0f0',
  textoSec:     '#aaaaaa',
  textoTer:     '#777777',
  textoDes:     '#555555',
  borde:        '#333333',
  bordeInput:   '#333333',
  sep:          '#2a2a2a',
  fondoRojo:    '#2d1215',
  fondoVerde:   '#0d2420',
  fondoAzul:    '#0d1e2d',
  fondoNaranja: '#2d2510',
  fondoIndigo:  '#1a1a2e',
  oscuro:       true,
};

interface TemaCtxValue {
  t:          Tema;
  toggleTema: () => void;
}

const TemaCtx = createContext<TemaCtxValue>({
  t:          CLARO,
  toggleTema: () => {},
});

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [esOscuro, setEsOscuro] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('micromo_tema').then(v => {
      if (v === 'oscuro') setEsOscuro(true);
    });
  }, []);

  const toggleTema = useCallback(() => {
    setEsOscuro(prev => {
      const next = !prev;
      AsyncStorage.setItem('micromo_tema', next ? 'oscuro' : 'claro');
      return next;
    });
  }, []);

  return (
    <TemaCtx.Provider value={{ t: esOscuro ? OSCURO : CLARO, toggleTema }}>
      {children}
    </TemaCtx.Provider>
  );
}

export const useTheme = () => useContext(TemaCtx);
