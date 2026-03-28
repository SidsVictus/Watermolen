import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function downloadCSV(data: any[], filename = "sensor_data.csv") {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]).join(",");
  const rows = data.map(row => 
    Object.values(row).map(val => 
      typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
    ).join(",")
  ).join("\n");

  const csv = `${headers}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCSV(csvText: string): any[] | null {
  try {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const currentline = lines[i].split(',');
      const obj: any = {};
      for (let j = 0; j < headers.length; j++) {
        let val = currentline[j]?.trim().replace(/^"|"$/g, '') || '';
        // Attempt to parse numbers
        if (!isNaN(Number(val)) && val !== '') {
          obj[headers[j]] = Number(val);
        } else {
          obj[headers[j]] = val;
        }
      }
      result.push(obj);
    }
    return result;
  } catch (e) {
    console.error("Failed to parse CSV", e);
    return null;
  }
}
