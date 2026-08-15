const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 TU LLAVE DE DIGITAL FEMSA — REEMPLÁZALA POR LA TUYA
const FEMSA_API_KEY = "key_eYvWV76blahblahblah";

const pagos = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==============================================
// 🌐 PÁGINA PRINCIPAL — Sirve el archivo HTML
// ==============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==============================================
// 💰 ENDPOINT: Crear Pago OXXO — Digital Femsa
// ==============================================
app.post('/api/crear-pago-oxxo', async (req, res) => {
  try {
    const { monto, nombre_cliente, email, telefono } = req.body;

    if (!monto || monto < 100) {
      return res.status(400).json({ error: "El monto mínimo es $100 MXN", exito: false });
    }
    if (!nombre_cliente) {
      return res.status(400).json({ error: "Nombre del cliente requerido", exito: false });
    }

    console.log("📤 Solicitando OXXO Pay:", { monto, nombre_cliente, email });

    const respuesta = await fetch('https://api.digitalfemsa.io/orders', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.es.femsa-v2.0.0+json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FEMSA_API_KEY}`
      },
      body: JSON.stringify({
        currency: "MXN",
        customer_info: {
          name: nombre_cliente,
          email: email || "cliente@escaladafinanciera.com",
          phone: telefono || "+525512345678"
        },
        line_items: [{
          name: "Depósito — Escalada Financiera",
          unit_price: Math.round(monto * 100),
          quantity: 1
        }],
        charges: [{
          payment_method: {
            type: "oxxo",
            expires_at: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60)
          }
        }]
      })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      console.error("❌ Error Femsa:", datos);
      return res.status(400).json({ 
        error: datos.message || "Error al crear el pago", 
        exito: false 
      });
    }

    const oxxo = datos.charges?.data?.[0]?.payment_method;
    if (!oxxo) {
      return res.status(500).json({ error: "No se recibió datos de OXXO", exito: false });
    }

    pagos.set(datos.id, {
      referencia: oxxo.reference,
      monto,
      nombre: nombre_cliente,
      estado: "pendiente",
      creado: new Date()
    });

    console.log("✅ OXXO Pay creado:", oxxo.reference);

    res.json({
      exito: true,
      orden_id: datos.id,
      referencia: oxxo.reference,
      codigo_barras_url: oxxo.barcode_url,
      monto_total: monto,
      expira: new Date(oxxo.expires_at * 1000).toLocaleDateString('es-MX', { dateStyle: 'full' })
    });

  } catch (error) {
    console.error("❌ Error servidor:", error);
    res.status(500).json({ error: error.message, exito: false });
  }
});

// ==============================================
// 🔔 WEBHOOK — Recibir confirmación de pago
// ==============================================
app.post('/api/webhook-femsa', (req, res) => {
  const evento = req.body;
  console.log("\n📩 Webhook recibido — Tipo:", evento.type);

  if (evento.type === "order.paid") {
    const orden = evento.data.object;
    const referencia = orden.charges?.data?.[0]?.payment_method?.reference;
    const monto = orden.line_items?.[0]?.unit_price / 100;

    console.log("✅ ======================================");
    console.log("✅ PAGO CONFIRMADO POR DIGITAL FEMSA!");
    console.log("✅ Orden ID:", orden.id);
    console.log("✅ Referencia OXXO:", referencia);
    console.log("✅ Monto: $" + monto + " MXN");
    console.log("✅ ======================================");

    if (pagos.has(orden.id)) {
      pagos.get(orden.id).estado = "pagado";
      pagos.get(orden.id).fecha_pago = new Date();
    }
  }

  res.status(200).send("OK");
});

// ==============================================
// 🚀 INICIAR SERVIDOR
// ==============================================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     🚀 ESCALADA FINANCIERA — LISTA ✅         ║
╠══════════════════════════════════════════════╣
║  Servidor corriendo en el puerto ${PORT}       ║
╚══════════════════════════════════════════════╝
  `);
});
