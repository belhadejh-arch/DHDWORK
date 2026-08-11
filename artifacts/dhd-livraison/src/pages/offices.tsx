import React, { useState } from 'react';
import { useListOffices } from '@workspace/api-client-react';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useI18n } from '@/context/i18n';
import { MapPin, QrCode, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { API_BASE } from '@/lib/api-base';
import { useToast } from '@/hooks/use-toast';

export default function Offices() {
  const { t } = useI18n();
  const { data: offices, isLoading } = useListOffices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.offices')}</h1>
        <p className="text-muted-foreground mt-1">{t('offices.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <p>{t('action.loading')}</p>
        ) : offices?.map(office => (
          <OfficeCard key={office.id} office={office} />
        ))}
      </div>
    </div>
  );
}

function OfficeCard({ office }: { office: any }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const token = localStorage.getItem('dhd_admin_token') ?? '';
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load QR on mount (just once — QR is static until admin renews)
  React.useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch(`${API_BASE}/offices/${office.id}/qrcode`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setQrToken(data.token ?? null))
      .catch(() => {});
  }, [office.id, token, loaded]);

  const renewQr = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/offices/${office.id}/qrcode/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQrToken(data.token ?? null);
      toast({ title: t('offices.qr_renewed') });
    } catch {
      toast({ variant: 'destructive', title: t('offices.qr_renew_failed') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden shadow-sm flex flex-col">
      <CardHeader className="bg-muted/30 border-b">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">
              <Link href={`/offices/${office.id}`} className="hover:text-primary transition-colors">{office.name}</Link>
            </CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {office.address || `Lat: ${office.latitude.toFixed(4)}, Lng: ${office.longitude.toFixed(4)}`}
            </CardDescription>
          </div>
          <Link href={`/offices/${office.id}`}>
            <Button variant="outline" size="sm">
              {t('office.open')} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-6 flex-1 flex flex-col items-center justify-center text-center">
        <div className="mb-4 text-sm text-muted-foreground">
          {t('offices.qr_hint')}
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border mb-4">
          {qrToken ? (
            <QRCode 
              value={qrToken} 
              size={200}
              level="H"
            />
          ) : (
            <div className="h-[200px] w-[200px] bg-muted animate-pulse flex items-center justify-center rounded">
              <QrCode className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={renewQr}
          disabled={loading}
          className="mt-2 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? t('offices.qr_renewing') : t('offices.qr_renew')}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">{t('offices.qr_renew_hint')}</p>
      </CardContent>
    </Card>
  );
}
