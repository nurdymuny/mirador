#!/usr/bin/env python3
"""Math audit for all 9 paper specs."""
import math

K_ADMET = 0.1
def tau(a,m): return math.log10(a/m)
def Kb(R): return max(1/R-1,-1) if R>0 else 99
def Kt(R,ka=K_ADMET): return ka+Kb(R)
def coh(t,R,ka=K_ADMET):
    k=Kt(R,ka)
    return float('inf') if k<=0 else t/k

def fmt(v): return 'inf' if v==float('inf') else f'{v:.3f}'

print('=== TABLE G4 (Paper #3 Gillespie) ===')
print(f'{"Drug":<5} {"tau":>6} {"R_cell":>7} {"C_cell":>8} {"R_case":>7} {"C_case":>8}')
drugs = [
    ('INH', 15, 0.05, 0.41, 0.50),
    ('RIF', 60, 1.0, 0.13, 3.00),
    ('PZA', 380, 50, 0.35, 0.80),
    ('EMB', 12, 5.0, 0.30, 0.10),
    ('MXF', 35, 0.25, 1.61, 0.20),
]
for name,auc,mic,rc,rk in drugs:
    t = tau(auc,mic)
    cc = coh(t,rc)
    ck = coh(t,rk)
    print(f'{name:<5} {t:>6.3f} {rc:>7.2f} {fmt(cc):>8} {rk:>7.2f} {fmt(ck):>8}')

print('\nSpec claims: INH C_cell=4.26 C_case=2.48')
print('Spec claims: PZA C_cell=0.50 C_case=3.52')
print('Spec claims: RIF C_cell=0.24')
print()

print('=== TABLE N2 (Paper #10 Nau) ===')
nau = [
    ('CRO',1000,0.06,0.01,0.15,0.15),
    ('VAN',400,0.5,0.01,0.10,0.25),
    ('RIF',60,0.06,0.07,0.20,0.15),
    ('LZD',90,1.0,0.30,0.60,0.10),
    ('MER',120,0.02,0.01,0.10,0.10),
    ('MET',100,4.0,0.80,0.90,0.05),
    ('AMP',50,0.03,0.01,0.10,0.10),
    ('CHL',80,2.0,0.30,0.50,0.10),
]
print(f'{"Drug":<5} {"tau":>6} {"C_unin":>8} {"C_infl":>8}')
for name,auc,mic,ru,ri,ka in nau:
    t = tau(auc,mic)
    cu = coh(t,ru,ka)
    ci = coh(t,ri,ka)
    print(f'{name:<5} {t:>6.3f} {fmt(cu):>8} {fmt(ci):>8}')
    
print('\nSpec claims: CRO C_un=0.043 C_in=0.754')
print('Spec claims: VAN C_un=0.026 C_in=0.281')
print('Spec claims: LZD C_un=0.718 C_in=1.322')
print()

# Paper #6 Zimmerli
print('=== TABLE Z2 (Paper #6 Zimmerli) ===')
pji = {
    'CIP': (30,0.5,0.40,0.30,0.01),
    'RIF': (60,0.008,0.35,0.20,2.50),
}
for name,(auc,mic,rb,rs,rf) in pji.items():
    t = tau(auc,mic)
    cb = coh(t,rb); cs = coh(t,rs); cf = coh(t,rf)
    print(f'{name}: tau={t:.3f} C_bone={fmt(cb)} C_surf={fmt(cs)} C_bio={fmt(cf)}')
print('Spec: CIP C_bone=1.14 C_surf=1.65 C_bio=0.018')
print('Spec: RIF C_bone=2.38 C_surf=4.21 C_bio=inf')
print()

# Paper #7 Landersdorfer - spot check MXF
print('=== TABLE L2 (Paper #7 Landersdorfer) spot checks ===')
bone = [
    ('MXF',35,0.125,0.80),
    ('RIF',60,0.008,0.35),
    ('LZD',90,2.0,0.50),
    ('VAN',400,1.0,0.20),
    ('CIP',30,0.5,0.40),
]
for name,auc,mic,rb in bone:
    t = tau(auc,mic)
    c = coh(t,rb)
    print(f'{name}: tau={t:.3f} C_bone={fmt(c)}')
print('Spec: MXF=8.87 RIF=2.38 LZD=1.14 VAN=0.55 CIP=1.14')
print()

# Paper #5 Best - EFV
print('=== TABLE B2 (Paper #5 Best) ===')
t_efv = tau(184, 0.001)
c_efv = coh(t_efv, 0.005, 0.20)
t_nvp = tau(90, 0.010)
c_nvp = coh(t_nvp, 0.450, 0.20)
c_nvp_ka01 = coh(t_nvp, 0.450, 0.10)
print(f'EFV: tau={t_efv:.3f} C_CSF={fmt(c_efv)} (K_ADMET=0.20)')
print(f'NVP: tau={t_nvp:.3f} C_CSF={fmt(c_nvp)} (K_ADMET=0.20)')
print(f'NVP: tau={t_nvp:.3f} C_CSF={fmt(c_nvp_ka01)} (K_ADMET=0.10)')
print('Spec: EFV C=0.0264, NVP C=2.99')
print('Spec Table B2: K_ADMET=0.20 for EFV')
print()

# Paper #8 Craig tau targets
print('=== Paper #8 Craig - tau targets ===')
targets = [(125,'FQ GNR'),(30,'FQ GPC'),(400,'VAN MRSA'),(80,'LZD'),(25,'Macrolide')]
for val,name in targets:
    print(f'{name}: AUC/MIC>{val} => tau>{math.log10(val):.3f}')
print('Spec: FQ GNR tau>2.097, VAN tau>2.602')
