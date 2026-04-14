// CONFIG GLOBAL DO APP
window.APP_CONFIG = {
    SUPABASE_URL: "https://dvkcxpwhbpiltqovveue.supabase.co",
    SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2a2N4cHdoYnBpbHRxb3Z2ZXVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjA5NTMsImV4cCI6MjA4OTA5Njk1M30.g7c0k_iRG0sEHwo9Wy_qWn8tONNHd1b2mxhkl97tcPk",

    // OPCIONAL (recomendado já deixar preparado)
    COMPANY: {
        NAME: "MacTec Support",
        CITY: "São Bernardo do Campo",
        STATE: "SP",
        WHATSAPP: "5511958085210"
    },

    // CONFIG DE FRETE
    SHIPPING: {
        PACKAGING_FEE: 5.00,
        LOCAL_DELIVERY_RADIUS_KM: 5
    },

    // URL da Edge Function de frete (API key de geocoding fica só no backend)
    FREIGHT_FUNCTION_URL: "https://dvkcxpwhbpiltqovveue.supabase.co/functions/v1/calcular-frete",
    OTP_FUNCTION_URL: "https://dvkcxpwhbpiltqovveue.supabase.co/functions/v1/customer-verification",
};
