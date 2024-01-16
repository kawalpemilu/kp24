export declare interface Hierarchy {
  // The id is one of idProvinsi, idKabupaten, idKecamatan, idDesa.
  // The value is the name for the id.
  id2name: { [id: string]: string };

  // The id is the idDesa.
  // The value is [maxTpsNo, extBegin?, extEnd?].
  // signifying that the TPS has number from [1, maxTpsNo].
  // and optionally it has extended number from [extBegin, extEnd].
  tps: { [id: string]: number[] };
}

// The aggregated votes at Provinsi, Kabupaten, and Kecamatan level.
export declare interface AggregateVotes {
  idLokasi: string;

  // The name of this location.
  name: string;

  // The number of votes for each paslon.
  pas1: number;
  pas2: number;
  pas3: number;

  // Total valid votes.
  sah: number;

  // Total invalid votes.
  tidakSah: number;

  // The total number of TPS in this aggregated votes.
  totalTps: number;

  // Total TPS has at least one photo.
  totalCompletedTps: number;

  // The upload timestamp.
  uploadTimeMs: number;

  // The blobId of the image file.
  // Only available at Desa level.
  imageId: string;

  // The serving url of the imageId.
  // Only available at Desa level.
  photoUrl: string;
}

// Lokasi detail for Provinsi, Kabupaten, and Kecamatan level.
export declare interface Lokasi {
  // The 10 digits id formatted as folows:
  // The first 2 is the idProvinsi.
  // The next 2 is the idKabupaten.
  // The next 2 is the idKecamatan.
  // The next 4 is the idDesa.
  id: string;

  // The names depending on the hierarchy:
  // The 0-th index is tha name of the Provinsi.
  // The 1-th index is tha name of the Kabupaten.
  // The 2-th index is tha name of the Kecamatan.
  // The 3-th index is tha name of the Desa.
  names: string[];

  // The aggregated votes of all the children of this Node.
  // If the current id is idProvinsi, then the cid is idKabupaten.
  // If the current id is idDesa, then the cid is Tps No.
  aggregated: { [cid: string]: AggregateVotes };
}

// Photos and votes at Desa level.
export declare interface TpsData {
  // The idDesa + tpsNo.
  id: string;

  // One TPS can have many photos.
  // The votes in each photo is digitized.
  votes: { [imageId: string]: AggregateVotes };
}

export declare interface UploadRequest {
  // The idDesa + tpsNo
  idLokasi: string;

  // The user's UID.
  uid: string;

  // The blobId in the cloud storage.
  imageId: string;

  // Number of votes for paslon 1, 2, 3
  pas1: number;
  pas2: number;
  pas3: number;

  // Number of valid votes.
  sah: number;

  // Number of invalid votes.
  tidakSah: number;
}
