let map;
let directionsService;
let directionsRenderer;
let originAutocomplete;
let destinationAutocomplete;

function initMap() {
  const initialPosition = { lat: 35.6809591, lng: 139.7673068 }; // Tokyo Station

  map = new google.maps.Map(document.getElementById("map"), {
    center: initialPosition,
    zoom: 6,
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: false,
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: false,
  });

  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");

  const autocompleteOptions = {
    fields: ["formatted_address", "geometry", "name", "place_id"],
  };

  originAutocomplete = new google.maps.places.Autocomplete(originInput, autocompleteOptions);
  destinationAutocomplete = new google.maps.places.Autocomplete(
    destinationInput,
    autocompleteOptions
  );

  const form = document.getElementById("fuel-form");
  form.addEventListener("submit", onSubmitForm);
}

async function onSubmitForm(event) {
  event.preventDefault();

  const messageEl = document.getElementById("message");
  const resultsEl = document.getElementById("results");
  const totalDistanceEl = document.getElementById("total-distance");
  const fuelNeededEl = document.getElementById("fuel-needed");
  const fuelCostEl = document.getElementById("fuel-cost");

  resultsEl.hidden = true;
  messageEl.textContent = "ルートを計算しています...";

  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();
  const efficiency = parseFloat(document.getElementById("efficiency").value);
  const price = parseFloat(document.getElementById("price").value);

  if (!origin || !destination) {
    messageEl.textContent = "出発地と到着地を入力してください。";
    return;
  }

  if (!efficiency || efficiency <= 0 || !price || price <= 0) {
    messageEl.textContent = "燃費とガソリン価格には正しい値を入力してください。";
    return;
  }

  try {
    const result = await calculateRoute(origin, destination);

    if (!result) {
      messageEl.textContent = "ルートが見つかりませんでした。条件を変更して再度お試しください。";
      return;
    }

    directionsRenderer.setDirections(result);

    const distanceMeters = result.routes[0].legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const distanceKm = distanceMeters / 1000;
    const fuelNeeded = distanceKm / efficiency;
    const cost = fuelNeeded * price;

    totalDistanceEl.textContent = `${distanceKm.toFixed(1)} km`;
    fuelNeededEl.textContent = `${fuelNeeded.toFixed(2)} L`;
    fuelCostEl.textContent = `${Math.round(cost).toLocaleString()} 円`;

    messageEl.textContent = "";
    resultsEl.hidden = false;
  } catch (error) {
    console.error(error);
    messageEl.textContent = "ルート計算中にエラーが発生しました。時間をおいて再度お試しください。";
  }
}

function calculateRoute(origin, destination) {
  return new Promise((resolve, reject) => {
    directionsService.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        avoidFerries: false,
        drivingOptions: {
          departureTime: new Date(),
        },
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
          resolve(response);
        } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
          resolve(null);
        } else {
          reject(status);
        }
      }
    );
  });
}

window.initMap = initMap;
