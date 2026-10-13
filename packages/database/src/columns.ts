import { getTableColumns } from "drizzle-orm";
import * as mainSchema from "./schemas/schema";
import * as incidentSchema from "./schemas/incidents";
import * as phishingSchema from "./schemas/phishing";

export const columns = {
  incident: Object.entries(getTableColumns(mainSchema.incident)).map(([, value]) => value.name),
  incident_log: Object.entries(getTableColumns(mainSchema.incidentLog)).map(([, value]) => value.name),
  incident_artifact: Object.entries(getTableColumns(mainSchema.incidentArtifact)).map(([, value]) => value.name),
  incident_user: Object.entries(getTableColumns(mainSchema.incidentUser)).map(([, value]) => value.name),
  incident_extension: Object.entries(getTableColumns(mainSchema.incidentExtension)).map(([, value]) => value.name),
  malware_incident: Object.entries(getTableColumns(incidentSchema.malwareIncident)).map(([, value]) => value.name),
  ransomware_incident: Object.entries(getTableColumns(incidentSchema.ransomwareIncident)).map(([, value]) => value.name),
  data_breach_incident: Object.entries(getTableColumns(incidentSchema.dataBreachIncident)).map(([, value]) => value.name),
  ddos_incident: Object.entries(getTableColumns(incidentSchema.ddosIncident)).map(([, value]) => value.name),
  intrusion_incident: Object.entries(getTableColumns(incidentSchema.intrusionIncident)).map(([, value]) => value.name),
  phishing_detail: Object.entries(getTableColumns(phishingSchema.phishingDetail)).map(([, value]) => value.name),
  phishing_identity: Object.entries(getTableColumns(phishingSchema.phishingIdentity)).map(([, value]) => value.name),
  phishing_connection_log: Object.entries(getTableColumns(phishingSchema.phishingConnectionLog)).map(([, value]) => value.name),
  phishing_connection_action: Object.entries(getTableColumns(phishingSchema.phishingConnectionAction)).map(([, value]) => value.name),
}