package com.edward.bibliotecabiblica;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: desempacar el traspaso de un solo archivo (.bbt) sin pasar por el WebView.
        registerPlugin(TraspasoPaquetePlugin.class);
        // Plugin propio: llavero en el Android Keystore para las claves de IA.
        registerPlugin(LlaveroSeguroPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
