export interface ShippingRateResult {
  courierName: string;
  courierService: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  etd: string;
}

export interface BiteshipLookupResult {
  success: boolean;
  destinationAreaName?: string;
  destinationAreaId?: string;
  rates?: ShippingRateResult[];
  cheapestRate?: ShippingRateResult;
  formattedText?: string;
  error?: string;
}

export interface ShippingDiscountConfig {
  discountType: "fixed" | "percentage" | "none";
  discountValue: number; // e.g. 10000 for Rp 10.000, or 50 for 50%
  discountNote?: string;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/**
 * Search destination area on Biteship Maps API
 */
export async function searchBiteshipArea(
  query: string,
  apiKey: string
): Promise<{ id: string; name: string } | null> {
  try {
    if (!query || !apiKey) return null;
    const cleanQuery = query.trim();
    const cleanKey = apiKey.trim();

    const res = await fetch(
      `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(cleanQuery)}&type=single`,
      {
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.warn(`[Biteship Area Search] HTTP ${res.status}:`, await res.text());
      return null;
    }

    const data = await res.json() as any;
    const areas = data.areas || [];
    if (areas.length > 0) {
      return {
        id: areas[0].id,
        name: areas[0].name,
      };
    }
    return null;
  } catch (err) {
    console.error("[Biteship Area Search Error]:", err);
    return null;
  }
}

/**
 * Fetch shipping rates between origin and destination with discount computation
 */
export async function getBiteshipShippingRates(
  originAreaId: string,
  destinationQuery: string,
  weightGrams: number = 1000,
  apiKey: string,
  discountConfig: ShippingDiscountConfig = { discountType: "fixed", discountValue: 10000 }
): Promise<BiteshipLookupResult> {
  try {
    if (!originAreaId || !destinationQuery || !apiKey) {
      return { success: false, error: "Origin, destination query, and API key are required." };
    }

    // 1. Search destination area ID
    const area = await searchBiteshipArea(destinationQuery, apiKey);
    if (!area) {
      return {
        success: false,
        error: `Lokasi '${destinationQuery}' tidak ditemukan di sistem Biteship.`,
      };
    }

    // 2. Fetch rates from Biteship Couriers Rates API
    const ratesRes = await fetch("https://api.biteship.com/v1/rates/couriers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        origin_area_id: originAreaId,
        destination_area_id: area.id,
        couriers: "jne,jnt,sicepat,anteraja,idexpress",
        items: [
          {
            name: "Madu Murni Araa Honey",
            description: "Paket Madu 1 Botol",
            value: 125000,
            length: 10,
            width: 10,
            height: 15,
            weight: weightGrams || 1000,
            quantity: 1,
          },
        ],
      }),
    });

    if (!ratesRes.ok) {
      const errText = await ratesRes.text();
      return { success: false, error: `Biteship Rates API error: ${errText}` };
    }

    const ratesData = await ratesRes.json() as any;
    const pricingList = ratesData.pricing || [];

    if (pricingList.length === 0) {
      return { success: false, error: "Tidak ada kurir pengiriman yang tersedia untuk rute ini." };
    }

    // 3. Process each rate and apply discount
    const processedRates: ShippingRateResult[] = [];

    for (const item of pricingList) {
      const originalPrice = Number(item.price || 0);
      let discountedPrice = originalPrice;
      let discountAmount = 0;

      if (discountConfig.discountType === "fixed") {
        discountAmount = Math.min(originalPrice, Number(discountConfig.discountValue || 0));
        discountedPrice = Math.max(0, originalPrice - discountAmount);
      } else if (discountConfig.discountType === "percentage") {
        const pct = Math.min(100, Math.max(0, Number(discountConfig.discountValue || 0)));
        discountAmount = Math.round((originalPrice * pct) / 100);
        discountedPrice = Math.max(0, originalPrice - discountAmount);
      }

      processedRates.push({
        courierName: (item.courier_name || item.courier_code || "Kurir").toUpperCase(),
        courierService: item.courier_service_name || item.service_type || "Reguler",
        originalPrice,
        discountedPrice,
        discountAmount,
        etd: item.duration || item.shipment_duration_range || "2-4 hari",
      });
    }

    // Sort by discounted price ascending
    processedRates.sort((a, b) => a.discountedPrice - b.discountedPrice);
    const cheapest = processedRates[0];

    // 4. Construct helper summary string for AI prompt
    let formattedText = `[HASIL CEK ONGKIR BITESHIP REAL-TIME]\n`;
    formattedText += `Tujuan: ${area.name}\n`;
    formattedText += `Berat Paket: ${(weightGrams / 1000).toFixed(1)} Kg\n`;
    if (cheapest) {
      formattedText += `Tarif Normal Terhemat (${cheapest.courierName}): ${formatIDR(cheapest.originalPrice)}\n`;
      if (cheapest.discountAmount > 0) {
        formattedText += `Diskon/Subsidi Toko: ${formatIDR(cheapest.discountAmount)} (${discountConfig.discountNote || "Promo Subsidi Ongkir"})\n`;
        formattedText += `TARIF AKHIR KONSUMEN: ${formatIDR(cheapest.discountedPrice)} (Estimasi ${cheapest.etd})\n`;
      } else {
        formattedText += `TARIF AKHIR KONSUMEN: ${formatIDR(cheapest.originalPrice)} (Estimasi ${cheapest.etd})\n`;
      }
    }

    return {
      success: true,
      destinationAreaName: area.name,
      destinationAreaId: area.id,
      rates: processedRates,
      cheapestRate: cheapest,
      formattedText,
    };
  } catch (err: any) {
    console.error("[Biteship Lookup Error]:", err);
    return { success: false, error: err.message || "Failed to calculate shipping rates" };
  }
}
