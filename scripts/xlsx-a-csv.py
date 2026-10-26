"""Convierte la primera hoja de un .xlsx (export de SAP) a CSV separado por ';'
con comillas estándar, el formato que lee la app.

Uso: python3 -I scripts/xlsx-a-csv.py <entrada.xlsx> <salida.csv>
Requiere openpyxl (pip install openpyxl).
"""
import csv
import sys

import openpyxl


def celda(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def main(entrada, salida):
    wb = openpyxl.load_workbook(entrada, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    filas = 0
    with open(salida, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';', lineterminator='\r\n')
        for fila in ws.iter_rows(values_only=True):
            if not any(v not in (None, '') for v in fila):
                continue
            w.writerow([celda(v) for v in fila])
            filas += 1
    print(f'{filas} filas escritas en {salida}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
